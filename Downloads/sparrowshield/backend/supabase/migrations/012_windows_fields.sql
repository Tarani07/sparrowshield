-- Windows-specific device fields
DO $$ BEGIN
  ALTER TABLE devices ADD COLUMN IF NOT EXISTS windows_defender_enabled BOOLEAN;
  ALTER TABLE devices ADD COLUMN IF NOT EXISTS domain_joined BOOLEAN;
  ALTER TABLE devices ADD COLUMN IF NOT EXISTS domain_name TEXT;
  ALTER TABLE devices ADD COLUMN IF NOT EXISTS activation_status TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
