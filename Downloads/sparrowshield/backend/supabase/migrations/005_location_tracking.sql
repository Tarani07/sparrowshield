-- Migration 005: Device location tracking
ALTER TABLE devices ADD COLUMN IF NOT EXISTS public_ip text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS latitude float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS longitude float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS isp text;

CREATE INDEX IF NOT EXISTS idx_devices_country ON devices(country);
CREATE INDEX IF NOT EXISTS idx_devices_city ON devices(city);
