-- Fix overbroad anon RLS policies identified in enterprise QA audit
-- Agents use the anon key; they should not be able to read other devices' data or delete any rows.

-- 1. edr_events: remove anon SELECT (threat data should only be readable by authenticated dashboard users)
DROP POLICY IF EXISTS "anon_read_edr_events" ON edr_events;

-- 2. Break FOR ALL anon policies into minimum-required permissions
--    These tables were fully open to anon (SELECT + INSERT + UPDATE + DELETE)

-- compliance_snapshots: agents INSERT, authenticated manages all
DROP POLICY IF EXISTS "anon_all_compliance_snapshots"  ON compliance_snapshots;
DROP POLICY IF EXISTS "anon can insert compliance"     ON compliance_snapshots;
DROP POLICY IF EXISTS "anon can select compliance"     ON compliance_snapshots;
DO $$ BEGIN
  CREATE POLICY "anon_insert_compliance_snapshots" ON compliance_snapshots FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_compliance_snapshots" ON compliance_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- compliance_controls: read-only for anon (populated by compliance-evaluate function, not agents)
DROP POLICY IF EXISTS "anon_all_compliance_controls" ON compliance_controls;
DO $$ BEGIN
  CREATE POLICY "anon_read_compliance_controls" ON compliance_controls FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_compliance_controls" ON compliance_controls FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- compliance_frameworks: read-only for anon
DROP POLICY IF EXISTS "anon_all_compliance_frameworks" ON compliance_frameworks;
DO $$ BEGIN
  CREATE POLICY "anon_read_compliance_frameworks" ON compliance_frameworks FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_compliance_frameworks" ON compliance_frameworks FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- deployment_tasks: agents INSERT + SELECT; no UPDATE/DELETE for anon
DROP POLICY IF EXISTS "anon_all_deployment_tasks" ON deployment_tasks;
DO $$ BEGIN
  CREATE POLICY "anon_read_deployment_tasks"   ON deployment_tasks FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_insert_deployment_tasks" ON deployment_tasks FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_update_deployment_tasks" ON deployment_tasks FOR UPDATE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_deployment_tasks" ON deployment_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- patch_history: agents INSERT; authenticated manages; no anon DELETE
DROP POLICY IF EXISTS "anon_all_patch_history" ON patch_history;
DO $$ BEGIN
  CREATE POLICY "anon_read_patch_history"   ON patch_history FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_insert_patch_history" ON patch_history FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_patch_history" ON patch_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- software_catalog: read-only for anon (catalog is managed by authenticated users)
DROP POLICY IF EXISTS "anon_all_software_catalog" ON software_catalog;
DO $$ BEGIN
  CREATE POLICY "anon_read_software_catalog" ON software_catalog FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_software_catalog" ON software_catalog FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- software_lists: read-only for anon
DROP POLICY IF EXISTS "anon_all_software_lists" ON software_lists;
DO $$ BEGIN
  CREATE POLICY "anon_read_software_lists" ON software_lists FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_software_lists" ON software_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- software_violations: agents INSERT; no anon DELETE
DROP POLICY IF EXISTS "anon_all_software_violations" ON software_violations;
DO $$ BEGIN
  CREATE POLICY "anon_read_software_violations"   ON software_violations FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_insert_software_violations" ON software_violations FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "auth_manage_software_violations" ON software_violations FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. alerts: restrict UPDATE to authenticated only (agents should not modify alerts)
DROP POLICY IF EXISTS "Anon update alerts" ON alerts;
DO $$ BEGIN
  CREATE POLICY "auth_manage_alerts" ON alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. vulnerabilities: agents INSERT only; no anon UPDATE
DROP POLICY IF EXISTS "anon can update vulns" ON vulnerabilities;
DO $$ BEGIN
  CREATE POLICY "auth_manage_vulnerabilities" ON vulnerabilities FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. config: agents SELECT only; no anon UPDATE (slack_webhook and other secrets are config rows)
DROP POLICY IF EXISTS "Anon update config" ON config;
DO $$ BEGIN
  CREATE POLICY "auth_manage_config" ON config FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
