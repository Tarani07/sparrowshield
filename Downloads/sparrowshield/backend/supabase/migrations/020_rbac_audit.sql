-- ════════════════════════════════════════════════════════════════════════════
-- Roles (Admin / Read-only), membership-gated access, and an audit log.
--  • Only people listed in console_users can see anything in the dashboard —
--    important once Google/Okta sign-in is enabled (any Google account could
--    otherwise sign in and read the fleet).
--  • Admins can change things; viewers can only read.
--  • Agent (anon) policies are untouched.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS console_users (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  last_seen_at timestamptz
);
ALTER TABLE console_users ENABLE ROW LEVEL SECURITY;

-- Everyone who can already sign in today keeps full access.
INSERT INTO console_users (user_id, email, role)
SELECT id, email, 'admin' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION is_console_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM console_users WHERE user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION is_console_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM console_users WHERE user_id = auth.uid() AND role = 'admin');
$$;
GRANT EXECUTE ON FUNCTION is_console_member(), is_console_admin() TO authenticated;

-- Replace every dashboard (authenticated) policy with: members read, admins write.
DO $$
DECLARE t text; p record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT IN ('console_users', 'audit_log', 'api_tokens', 'telemetry', 'detection_rules')
  LOOP
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t AND 'authenticated' = ANY(roles)
    LOOP
      EXECUTE format('DROP POLICY %I ON %I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY console_member_read ON %I FOR SELECT TO authenticated USING (is_console_member())', t);
    EXECUTE format('CREATE POLICY console_admin_write ON %I FOR ALL TO authenticated USING (is_console_admin()) WITH CHECK (is_console_admin())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

CREATE POLICY console_users_read ON console_users FOR SELECT TO authenticated USING (is_console_member());
GRANT SELECT ON console_users TO authenticated;
-- Members may record their own last-seen time; role changes go through the admin-users function.
CREATE OR REPLACE FUNCTION touch_console_user() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE console_users SET last_seen_at = now() WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION touch_console_user() TO authenticated;

-- The config table holds secrets (Slack webhook, email API key). Agents never read it.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='config' AND 'anon' = ANY(roles) AND cmd IN ('SELECT','ALL')
  LOOP EXECUTE format('DROP POLICY %I ON config', p.policyname); END LOOP;
END $$;
REVOKE SELECT ON config FROM anon;

-- ── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_email text,
  action      text NOT NULL,          -- INSERT | UPDATE | DELETE
  table_name  text NOT NULL,
  record_id   text,
  summary     text,
  changes     jsonb                   -- {field: [old, new]} for updates; row for insert/delete
);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin_read ON audit_log FOR SELECT TO authenticated USING (is_console_admin());
GRANT SELECT ON audit_log TO authenticated;

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  old_j jsonb; new_j jsonb; diff jsonb := '{}'::jsonb; k text; rid text; label text;
BEGIN
  -- Only human actions from the console; agents (anon) and the service role are not audited here.
  IF uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  old_j := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  new_j := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(new_j) LOOP
      IF k NOT IN ('updated_at') AND old_j -> k IS DISTINCT FROM new_j -> k THEN
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_j -> k, new_j -> k));
      END IF;
    END LOOP;
    IF diff = '{}'::jsonb THEN RETURN NEW; END IF;
  END IF;
  rid := COALESCE(new_j ->> 'id', old_j ->> 'id', new_j ->> 'user_id', old_j ->> 'user_id', new_j ->> 'key', old_j ->> 'key');
  label := COALESCE(new_j ->> 'name', old_j ->> 'name', new_j ->> 'app_name', old_j ->> 'app_name',
                    new_j ->> 'domain', old_j ->> 'domain', new_j ->> 'hostname', old_j ->> 'hostname',
                    new_j ->> 'command_type', new_j ->> 'message', old_j ->> 'message', new_j ->> 'email', old_j ->> 'email', rid);
  INSERT INTO audit_log (actor_id, actor_email, action, table_name, record_id, summary, changes)
  VALUES (uid, claims ->> 'email', TG_OP, TG_TABLE_NAME, rid, left(label, 200),
          CASE WHEN TG_TABLE_NAME = 'config' THEN jsonb_build_object('value', '(redacted — may contain secrets)')
               WHEN TG_OP = 'UPDATE' THEN diff
               WHEN TG_OP = 'INSERT' THEN new_j - 'installed_apps' - 'prev_installed_apps'
               ELSE old_j - 'installed_apps' - 'prev_installed_apps' END);
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['software_lists','web_filter_rules','web_categories','block_rules','device_groups',
    'device_group_members','it_notices','device_commands','alerts','devices','config','console_users',
    'compliance_frameworks','compliance_controls','remediation_rules','software_violations','vulnerabilities']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row_change()', t);
    END IF;
  END LOOP;
END $$;
