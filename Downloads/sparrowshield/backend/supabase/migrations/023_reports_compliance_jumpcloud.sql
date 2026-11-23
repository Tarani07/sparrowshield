-- ════════════════════════════════════════════════════════════════════════════
-- Scheduled reports, custom compliance frameworks, JumpCloud System Insights.
-- ════════════════════════════════════════════════════════════════════════════

-- Secrets only edge functions (service role) can read — never exposed to the browser.
CREATE TABLE IF NOT EXISTS internal_secrets (
  name       text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE internal_secrets ENABLE ROW LEVEL SECURITY;          -- no policies: service role only
REVOKE ALL ON internal_secrets FROM anon, authenticated;
INSERT INTO internal_secrets (name, value) VALUES ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- Non-secret integration status the console may display (members read, admins write via functions).
CREATE TABLE IF NOT EXISTS integration_status (
  name          text PRIMARY KEY,            -- 'jumpcloud' | 'email' | ...
  configured    boolean NOT NULL DEFAULT false,
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,   -- non-secret options (e.g. from address, org id)
  last_sync_at  timestamptz,
  last_status   text,
  last_message  text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integration_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY console_member_read ON integration_status FOR SELECT TO authenticated USING (is_console_member());
GRANT SELECT ON integration_status TO authenticated;

-- ── Scheduled reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  report_type  text NOT NULL CHECK (report_type IN ('executive', 'alerts', 'compliance', 'devices')),
  frequency    text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week  smallint CHECK (day_of_week BETWEEN 0 AND 6),   -- 0 = Sunday (weekly)
  hour_utc     smallint NOT NULL DEFAULT 3 CHECK (hour_utc BETWEEN 0 AND 23),
  recipients   text[] NOT NULL DEFAULT '{}',
  send_slack   boolean NOT NULL DEFAULT false,
  enabled      boolean NOT NULL DEFAULT true,
  next_run_at  timestamptz,
  last_run_at  timestamptz,
  last_status  text,
  last_message text,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY console_member_read ON report_schedules FOR SELECT TO authenticated USING (is_console_member());
CREATE POLICY console_admin_write ON report_schedules FOR ALL TO authenticated USING (is_console_admin()) WITH CHECK (is_console_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON report_schedules TO authenticated;

-- next_run_at = the next slot after now for the schedule's frequency.
CREATE OR REPLACE FUNCTION report_next_run(freq text, dow smallint, hr smallint, after timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE base timestamptz := date_trunc('day', after AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + make_interval(hours => hr);
BEGIN
  IF freq = 'daily' THEN
    RETURN CASE WHEN base > after THEN base ELSE base + interval '1 day' END;
  ELSIF freq = 'weekly' THEN
    base := base + make_interval(days => ((coalesce(dow, 1) - extract(dow FROM base)::int + 7) % 7));
    RETURN CASE WHEN base > after THEN base ELSE base + interval '7 days' END;
  ELSE
    base := date_trunc('month', after AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + make_interval(hours => hr);
    RETURN CASE WHEN base > after THEN base ELSE base + interval '1 month' END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION report_schedules_set_next() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.frequency IS DISTINCT FROM OLD.frequency OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week
     OR NEW.hour_utc IS DISTINCT FROM OLD.hour_utc OR (NEW.enabled AND NOT OLD.enabled) THEN
    NEW.next_run_at := report_next_run(NEW.frequency, NEW.day_of_week, NEW.hour_utc);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_report_next ON report_schedules;
CREATE TRIGGER trg_report_next BEFORE INSERT OR UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION report_schedules_set_next();
DROP TRIGGER IF EXISTS audit_report_schedules ON report_schedules;
CREATE TRIGGER audit_report_schedules AFTER INSERT OR UPDATE OR DELETE ON report_schedules FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ── Custom compliance frameworks ─────────────────────────────────────────────
ALTER TABLE compliance_frameworks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE compliance_frameworks ADD COLUMN IF NOT EXISTS builtin boolean NOT NULL DEFAULT false;
ALTER TABLE compliance_frameworks ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
UPDATE compliance_frameworks SET builtin = true WHERE name IN ('SOC2', 'HIPAA');
ALTER TABLE compliance_snapshots ADD COLUMN IF NOT EXISTS framework_id uuid REFERENCES compliance_frameworks(id) ON DELETE CASCADE;

-- ── JumpCloud ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jumpcloud_systems (
  jc_id          text PRIMARY KEY,
  device_id      uuid REFERENCES devices(id) ON DELETE SET NULL,   -- matched SparrowShield device
  hostname       text,
  display_name   text,
  serial_number  text,
  os             text,
  os_version     text,
  arch           text,
  agent_version  text,
  active         boolean,
  last_contact   timestamptz,
  remote_ip      text,
  fde_active     boolean,
  fde_key_present boolean,
  insights       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- System Insights tables, keyed by table name
  synced_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jumpcloud_systems_serial_idx ON jumpcloud_systems (lower(serial_number));
ALTER TABLE jumpcloud_systems ENABLE ROW LEVEL SECURITY;
CREATE POLICY console_member_read ON jumpcloud_systems FOR SELECT TO authenticated USING (is_console_member());
GRANT SELECT ON jumpcloud_systems TO authenticated;
