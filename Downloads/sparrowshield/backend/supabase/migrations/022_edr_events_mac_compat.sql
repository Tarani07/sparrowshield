-- The Mac agent posts {device_id, event_type, action, timestamp, ...} but the table was built for the
-- Windows OCSF sensor (device_uid, ocsf_class_uid, event_time required), so Mac inserts were rejected.
ALTER TABLE edr_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE edr_events ALTER COLUMN ocsf_class_uid SET DEFAULT 1007;   -- OCSF Process Activity
ALTER TABLE edr_events ALTER COLUMN event_time SET DEFAULT now();
ALTER TABLE edr_events ALTER COLUMN action SET DEFAULT 'observed';
CREATE OR REPLACE FUNCTION edr_events_fill_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.device_uid IS NULL AND NEW.device_id IS NOT NULL THEN NEW.device_uid := NEW.device_id::text; END IF;
  IF NEW.device_uid IS NULL THEN NEW.device_uid := 'unknown'; END IF;
  IF NEW.timestamp IS NOT NULL AND NEW.event_time IS NULL THEN NEW.event_time := NEW.timestamp; END IF;
  IF NEW.mitre_technique_id IS NULL THEN NEW.mitre_technique_id := NEW.mitre_id; END IF;
  IF NEW.mitre_technique_name IS NULL THEN NEW.mitre_technique_name := NEW.mitre_name; END IF;
  IF NEW.image_path IS NULL THEN NEW.image_path := NEW.process_path; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_edr_events_defaults ON edr_events;
CREATE TRIGGER trg_edr_events_defaults BEFORE INSERT ON edr_events FOR EACH ROW EXECUTE FUNCTION edr_events_fill_defaults();
