-- Migration 003: Monitoring expansion — new device columns + security_events table

ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_pct int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_cycles int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_health text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_ssid text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS wifi_rssi int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS filevault_enabled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS firewall_enabled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sip_enabled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS gatekeeper_enabled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mdm_enrolled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS antivirus_installed text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS crash_count_24h int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_crashed_app text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS active_user text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS remote_session_active boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS net_upload_mb float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS net_download_mb float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS usb_devices jsonb DEFAULT '[]'::jsonb;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS installed_apps jsonb DEFAULT '[]'::jsonb;

-- Security events table for USB inserts, failed logins, remote sessions, crashes, malware
CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'usb_inserted', 'failed_login', 'remote_session', 'crash', 'malware_detected'
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_device ON security_events(device_id, created_at DESC);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read security_events" ON security_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert security_events" ON security_events FOR INSERT TO anon WITH CHECK (true);
