-- Detection engine schema additions

-- Add MITRE ATT&CK technique tag and rule ID to alerts
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS mitre_technique text,
  ADD COLUMN IF NOT EXISTS rule_id         text;

-- Index for deduplication check (open alerts by device + rule)
CREATE INDEX IF NOT EXISTS idx_alerts_dedup
  ON alerts (device_id, rule_id, resolved)
  WHERE resolved = false;

-- Detection rules table — rules can be updated without redeploying agents
CREATE TABLE IF NOT EXISTS detection_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  severity    text NOT NULL CHECK (severity IN ('info','warning','high','critical')),
  mitre_id    text,
  mitre_name  text,
  enabled     bool DEFAULT true NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- Allow anon (agent) to read rules and insert alerts
GRANT SELECT ON detection_rules TO anon;

-- Seed the initial rule set
INSERT INTO detection_rules (rule_id, name, description, severity, mitre_id, mitre_name) VALUES
  ('firewall_disabled',       'Firewall Disabled',              'Host firewall is turned off',                                           'warning',  'T1562.004', 'Impair Defenses: Disable or Modify System Firewall'),
  ('filevault_disabled',      'FileVault Disabled',             'Disk encryption (FileVault) is not enabled',                            'critical', 'T1486',     'Data Encrypted for Impact / Unencrypted Disk'),
  ('sip_disabled',            'SIP Disabled',                   'System Integrity Protection is off — kernel tampering possible',        'critical', 'T1562.001', 'Impair Defenses: Disable or Modify Tools'),
  ('gatekeeper_disabled',     'Gatekeeper Disabled',            'Unsigned/unnotarized apps can run without prompt',                      'high',     'T1553.001', 'Subvert Trust Controls: Gatekeeper Bypass'),
  ('screen_lock_disabled',    'Screen Lock Disabled',           'Device has no automatic screen lock configured',                        'warning',  'T1078',     'Valid Accounts: Physical Access Risk'),
  ('crypto_miner_process',    'Crypto Miner Detected',          'Known cryptocurrency mining process found running',                     'critical', 'T1496',     'Resource Hijacking'),
  ('tunneling_tool_detected', 'Tunneling Tool Running',         'Network tunneling or reverse proxy tool detected (ngrok, frp, etc.)',   'critical', 'T1572',     'Protocol Tunneling'),
  ('shell_on_port',           'Shell Listening on Port',        'A shell interpreter (bash/python/nc) is bound to a network port',      'critical', 'T1059',     'Command and Scripting Interpreter'),
  ('suspicious_port',         'Suspicious Port Listening',      'Process listening on a port commonly used by backdoors/C2 frameworks',  'high',     'T1049',     'System Network Connections Discovery'),
  ('root_session_active',     'Root Session Active',            'Root account has an active login session',                              'critical', 'T1078.003', 'Valid Accounts: Local Accounts'),
  ('high_cpu_non_system',     'Sustained High CPU (Non-System)','A non-system process is consuming >80% CPU — possible miner or abuse', 'warning',  'T1496',     'Resource Hijacking'),
  ('malicious_app_installed', 'Malicious App Installed',        'An application matching a known-malware name was found',               'critical', 'T1204',     'User Execution'),
  ('usb_storage_connected',   'USB Storage Device Connected',   'A USB mass storage device was plugged in',                             'warning',  'T1091',     'Replication Through Removable Media'),
  ('new_app_installed',       'New Application Installed',      'A new application appeared that was not present on previous scan',     'info',     'T1204',     'User Execution'),
  ('high_cpu_sustained',      'Sustained High CPU',             'CPU usage exceeded 90% for multiple consecutive heartbeats',           'warning',  'T1496',     'Resource Hijacking'),
  ('high_ram',                'High RAM Usage',                 'System RAM usage exceeded 90%',                                        'warning',  'T1496',     'Resource Hijacking'),
  ('low_disk',                'Low Disk Space',                 'Disk usage exceeded 90%',                                              'warning',  'T1485',     'Data Destruction / Disk Pressure'),
  ('disk_health_warning',     'Disk S.M.A.R.T. Warning',       'Disk health check returned a non-OK status',                           'critical', 'T1485',     'Data Destruction')
ON CONFLICT (rule_id) DO NOTHING;
