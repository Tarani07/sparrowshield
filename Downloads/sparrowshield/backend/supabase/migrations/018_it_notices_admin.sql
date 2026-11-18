-- IT Notices: dashboard admins create/deactivate notices; agents (anon) only read active ones.
DO $$ BEGIN
  CREATE POLICY "auth_manage_it_notices" ON it_notices FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON it_notices TO authenticated;
ALTER TABLE it_notices ALTER COLUMN active SET DEFAULT true;
ALTER TABLE it_notices ALTER COLUMN created_at SET DEFAULT now();
