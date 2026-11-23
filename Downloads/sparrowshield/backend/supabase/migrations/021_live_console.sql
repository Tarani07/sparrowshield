-- Live console: stream changes to the dashboard and report command progress.
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS progress smallint CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS progress_message text;
ALTER TABLE device_commands ADD COLUMN IF NOT EXISTS started_at timestamptz;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['alerts','devices','device_commands','security_events','software_violations',
                           'it_notices','web_filter_rules','web_categories','software_lists','av_scan_results']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
