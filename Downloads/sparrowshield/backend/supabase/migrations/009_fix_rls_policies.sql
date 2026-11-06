-- Fix overly-permissive RLS policies from prior migrations

-- remediation_rules: anon agents need SELECT only; dashboard users manage rules
DROP POLICY IF EXISTS "anon_all_remediation_rules" ON remediation_rules;
CREATE POLICY "anon_read_remediation_rules"   ON remediation_rules FOR SELECT TO anon        USING (true);
CREATE POLICY "anon_insert_remediation_rules" ON remediation_rules FOR INSERT TO anon        WITH CHECK (false);
CREATE POLICY "auth_manage_remediation_rules" ON remediation_rules FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- remediation_log: agents INSERT, authenticated users read; no anon deletes
DROP POLICY IF EXISTS "anon_all_remediation_log" ON remediation_log;
CREATE POLICY "anon_read_remediation_log"   ON remediation_log FOR SELECT TO anon        USING (true);
CREATE POLICY "anon_insert_remediation_log" ON remediation_log FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "auth_manage_remediation_log" ON remediation_log FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- remediation_beat_tracker: agents need SELECT + INSERT + UPDATE; no anon DELETE
DROP POLICY IF EXISTS "anon_all_remediation_beat_tracker" ON remediation_beat_tracker;
CREATE POLICY "anon_read_beat_tracker"   ON remediation_beat_tracker FOR SELECT TO anon        USING (true);
CREATE POLICY "anon_insert_beat_tracker" ON remediation_beat_tracker FOR INSERT TO anon        WITH CHECK (true);
CREATE POLICY "anon_update_beat_tracker" ON remediation_beat_tracker FOR UPDATE TO anon        USING (true);
CREATE POLICY "auth_manage_beat_tracker" ON remediation_beat_tracker FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- block_rules: agents SELECT only (enabled rules); only authenticated dashboard users write
DROP POLICY IF EXISTS "anon_delete_block_rules" ON block_rules;
DROP POLICY IF EXISTS "anon_insert_block_rules" ON block_rules;
DROP POLICY IF EXISTS "anon_update_block_rules" ON block_rules;
CREATE POLICY "auth_manage_block_rules" ON block_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- edr_events: agents (anon) INSERT; everyone can SELECT; no anon UPDATE/DELETE
DROP POLICY IF EXISTS "anon_insert_edr_events" ON edr_events;
CREATE POLICY "anon_insert_edr_events" ON edr_events FOR INSERT TO anon WITH CHECK (true);
