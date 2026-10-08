-- SparrowShield v2.0 — CIS Compliance + Vulnerability Management
-- Run in Supabase SQL Editor

-- ── 1. Compliance snapshots table ──────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    UUID REFERENCES devices(id) ON DELETE CASCADE,
  hostname     TEXT,
  os_type      TEXT,
  framework    TEXT,            -- "CIS macOS Benchmark" | "CIS Windows Benchmark"
  score_pct    INTEGER,         -- 0-100
  passed       INTEGER,
  total        INTEGER,
  details      JSONB,           -- per-control pass/fail
  snapshot_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_device ON compliance_snapshots(device_id);
CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_at     ON compliance_snapshots(snapshot_at DESC);

ALTER TABLE compliance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can insert compliance" ON compliance_snapshots FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can select compliance" ON compliance_snapshots FOR SELECT TO anon USING (true);
GRANT SELECT, INSERT ON compliance_snapshots TO anon;

-- ── 2. Vulnerabilities table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vulnerabilities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    UUID REFERENCES devices(id) ON DELETE CASCADE,
  hostname     TEXT,
  app_name     TEXT,
  version      TEXT,
  eol_since    TEXT,
  severity     TEXT DEFAULT 'high',
  cve_ids      TEXT[],          -- for future CVE feed integration
  patched      BOOLEAN DEFAULT false,
  patched_at   TIMESTAMPTZ,
  detected_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vulns_device   ON vulnerabilities(device_id);
CREATE INDEX IF NOT EXISTS idx_vulns_detected ON vulnerabilities(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_vulns_patched  ON vulnerabilities(patched);

ALTER TABLE vulnerabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can insert vulns" ON vulnerabilities FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can select vulns" ON vulnerabilities FOR SELECT TO anon USING (true);
CREATE POLICY "anon can update vulns" ON vulnerabilities FOR UPDATE TO anon USING (true);
GRANT SELECT, INSERT, UPDATE ON vulnerabilities TO anon;

-- ── 3. New columns on devices ──────────────────────────────────
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cis_score_pct    INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cis_passed       INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cis_total        INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cis_details      JSONB;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS vulnerability_count INTEGER DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_model        TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS auto_update_enabled BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ssh_enabled      BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS remote_desktop_enabled BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS defender_tamper_protection BOOLEAN;

-- ── 4. Security events table (for UEBA timeline) ───────────────
CREATE TABLE IF NOT EXISTS security_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    UUID REFERENCES devices(id) ON DELETE CASCADE,
  hostname     TEXT,
  event_type   TEXT,            -- "failed_login" | "new_admin" | "lateral_movement" | "off_hours_logon" etc.
  severity     TEXT DEFAULT 'info',
  details      JSONB,
  mitre_technique TEXT,
  occurred_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_device ON security_events(device_id);
CREATE INDEX IF NOT EXISTS idx_security_events_at     ON security_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type   ON security_events(event_type);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can insert events" ON security_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can select events" ON security_events FOR SELECT TO anon USING (true);
GRANT SELECT, INSERT ON security_events TO anon;

-- ── 5. Seed detection rules for v2.0 features ──────────────────
INSERT INTO detection_rules (id, rule_id, name, severity, description, mitre_technique, os_type, enabled)
VALUES
  (gen_random_uuid(), 'wmi_persistence',          'WMI Event Subscription',        'critical', 'Malware using WMI for persistence', 'T1546.003', 'windows', true),
  (gen_random_uuid(), 'registry_persistence',     'Registry Run Key Persistence',  'high',     'Suspicious entry in Run/RunOnce key', 'T1547.001', 'windows', true),
  (gen_random_uuid(), 'suspicious_root_cert',     'Untrusted Root Certificate',    'high',     'Unknown CA in trusted certificate store', 'T1553.004', 'windows', true),
  (gen_random_uuid(), 'vulnerable_software',      'EOL Software Detected',         'high',     'Application with known EOL version running', 'T1203', 'windows', true),
  (gen_random_uuid(), 'many_pending_updates',     'Many Pending Updates',          'warning',  'Device is missing 10+ security updates', 'T1203', 'windows', true),
  (gen_random_uuid(), 'lolbin_activity',          'LOLBin Abuse Detected',         'high',     'Living-off-the-land binary in use', 'T1218', 'windows', true),
  (gen_random_uuid(), 'suspicious_persistence',   'Suspicious LaunchAgent',        'high',     'Non-Apple LaunchAgent/Daemon detected', 'T1543.001', 'mac', true),
  (gen_random_uuid(), 'tcc_full_disk_access',     'TCC Full Disk Access Abuse',    'warning',  'Non-standard app has Full Disk Access', 'T1530', 'mac', true),
  (gen_random_uuid(), 'suspicious_browser_extension', 'Suspicious Browser Extension', 'warning', 'Browser extension with broad permissions', 'T1176', 'mac', true),
  (gen_random_uuid(), 'auto_update_disabled',     'Automatic Updates Disabled',    'warning',  'Device may miss security patches', 'T1203', 'mac', true),
  (gen_random_uuid(), 'remote_desktop_enabled',   'Remote Desktop Active',         'warning',  'Apple Remote Desktop (ARD) is enabled', 'T1021.005', 'mac', true)
ON CONFLICT (rule_id) DO UPDATE SET
  name        = EXCLUDED.name,
  severity    = EXCLUDED.severity,
  description = EXCLUDED.description,
  enabled     = EXCLUDED.enabled;
