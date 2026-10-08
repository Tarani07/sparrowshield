ALTER TABLE metrics ADD COLUMN IF NOT EXISTS outdated_apps jsonb DEFAULT '[]'::jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS outdated_apps jsonb DEFAULT '[]'::jsonb;
