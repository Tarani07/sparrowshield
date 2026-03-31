-- SOC2/HIPAA Compliance Mapping
CREATE TABLE IF NOT EXISTS compliance_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS compliance_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  control_id TEXT NOT NULL,
  control_name TEXT NOT NULL,
  description TEXT,
  field_checks JSONB NOT NULL DEFAULT '[]',
  severity TEXT DEFAULT 'medium'
);

CREATE TABLE IF NOT EXISTS compliance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  framework TEXT NOT NULL,
  score NUMERIC DEFAULT 0,
  pass_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  details JSONB DEFAULT '[]',
  snapshot_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE compliance_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_compliance_frameworks" ON compliance_frameworks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_compliance_controls" ON compliance_controls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_compliance_snapshots" ON compliance_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Seed SOC2 framework
INSERT INTO compliance_frameworks (name, enabled) VALUES ('SOC2', true) ON CONFLICT (name) DO NOTHING;
INSERT INTO compliance_frameworks (name, enabled) VALUES ('HIPAA', true) ON CONFLICT (name) DO NOTHING;

-- Seed SOC2 controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, field_checks, severity)
SELECT f.id, v.control_id, v.control_name, v.description, v.field_checks::jsonb, v.severity
FROM compliance_frameworks f,
(VALUES
  ('SOC2', 'CC6.1', 'Logical Access', 'Screen lock must be enabled', '[{"field":"screen_lock_enabled","expect":true}]', 'high'),
  ('SOC2', 'CC6.6', 'Security Operations', 'Firewall and antivirus required', '[{"field":"firewall_enabled","expect":true},{"field":"antivirus_installed","expect":"not_null"}]', 'high'),
  ('SOC2', 'CC6.7', 'Change Management', 'OS updates must be current', '[{"field":"pending_update_count","expect":0,"operator":"<="}]', 'medium'),
  ('SOC2', 'CC6.8', 'Encryption', 'Disk encryption required', '[{"field":"filevault_enabled","expect":true}]', 'critical'),
  ('SOC2', 'CC7.1', 'Monitoring', 'Device must check in regularly', '[{"field":"last_seen","expect":"recent","max_age_hours":24}]', 'medium'),
  ('SOC2', 'CC8.1', 'Asset Management', 'Serial number and OS recorded', '[{"field":"serial_number","expect":"not_null"},{"field":"os_version","expect":"not_null"}]', 'low')
) AS v(fw, control_id, control_name, description, field_checks, severity)
WHERE f.name = v.fw;

-- Seed HIPAA controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, field_checks, severity)
SELECT f.id, v.control_id, v.control_name, v.description, v.field_checks::jsonb, v.severity
FROM compliance_frameworks f,
(VALUES
  ('HIPAA', '164.312(a)(1)', 'Access Control', 'Screen lock and MDM enrollment required', '[{"field":"screen_lock_enabled","expect":true},{"field":"mdm_enrolled","expect":true}]', 'critical'),
  ('HIPAA', '164.312(a)(2)(iv)', 'Encryption', 'Full disk encryption required', '[{"field":"filevault_enabled","expect":true}]', 'critical'),
  ('HIPAA', '164.312(b)', 'Audit Controls', 'Login history must be available', '[{"field":"login_history","expect":"not_null"}]', 'high'),
  ('HIPAA', '164.312(c)(1)', 'Integrity Controls', 'SIP and Gatekeeper must be enabled', '[{"field":"sip_enabled","expect":true},{"field":"gatekeeper_enabled","expect":true}]', 'high'),
  ('HIPAA', '164.312(d)', 'Authentication', 'Screen lock delay must be ≤300 seconds', '[{"field":"screen_lock_delay_sec","expect":300,"operator":"<="}]', 'high')
) AS v(fw, control_id, control_name, description, field_checks, severity)
WHERE f.name = v.fw;
