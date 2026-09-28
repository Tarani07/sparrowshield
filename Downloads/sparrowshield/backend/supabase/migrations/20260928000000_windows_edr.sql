-- Windows EDR: host isolation field + device_commands table enhancements
-- Run this in Supabase SQL editor

-- 1. Add isolated column to devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS isolated BOOLEAN DEFAULT false;

-- 2. Add uac_enabled, rdp_enabled, guest_enabled, defender_enabled columns
ALTER TABLE devices ADD COLUMN IF NOT EXISTS uac_enabled           BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS rdp_enabled           BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS guest_enabled         BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS autologon_enabled     BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS defender_enabled      BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS defender_mode         TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS defender_sig_age_days INTEGER;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_volumes       JSONB;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_update_count  INTEGER DEFAULT 0;

-- 3. Add device_commands table if not exists (for remote commands)
CREATE TABLE IF NOT EXISTS device_commands (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  command_type   TEXT NOT NULL,
  payload        JSONB DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','failed')),
  result         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at    TIMESTAMPTZ
);

-- 4. Ensure anon can read/write device_commands
GRANT SELECT, INSERT, UPDATE ON device_commands TO anon;

-- 5. Add Windows-specific detection rules (uses existing schema: rule_id, name, description, severity, mitre_id, mitre_name)
INSERT INTO detection_rules (rule_id, name, description, severity, mitre_id, mitre_name) VALUES
  ('uac_disabled',           'UAC Disabled',             'User Account Control is off — privilege escalation unrestricted', 'critical', 'T1548.002', 'Abuse Elevation Control Mechanism: Bypass User Account Control'),
  ('guest_account_enabled',  'Guest Account Enabled',    'Guest account is active — unauthorised local access possible',    'high',     'T1078.003', 'Valid Accounts: Local Accounts'),
  ('autologon_enabled',      'AutoLogon Configured',     'Auto-logon stores credentials in the registry in plain text',     'high',     'T1552.002', 'Unsecured Credentials: Credentials in Registry'),
  ('defender_disabled',      'Defender Disabled',        'Windows Defender real-time protection is off',                    'critical', 'T1562.001', 'Impair Defenses: Disable or Modify Tools'),
  ('rdp_exposed',            'RDP Exposed',              'Remote Desktop is enabled — ensure it is access-controlled',      'warning',  'T1021.001', 'Remote Services: Remote Desktop Protocol'),
  ('brute_force_detected',   'Brute-Force Detected',     '10+ failed logins in one hour',                                   'critical', 'T1110',     'Brute Force'),
  ('account_lockout',        'Account Lockout',          'User account locked out',                                         'high',     'T1110.003', 'Brute Force: Password Spraying'),
  ('lateral_movement_risk',  'Lateral Movement Risk',    'Excessive explicit-credential logons (Event 4648)',               'high',     'T1550.003', 'Use Alternate Authentication Material: Pass the Hash'),
  ('new_admin_added',        'New Admin Added',          'User added to Administrators group',                               'critical', 'T1136.001', 'Create Account: Local Account'),
  ('off_hours_login',        'Off-Hours Login',          'Authentication activity outside business hours',                  'warning',  'T1078',     'Valid Accounts'),
  ('ransomware_activity',    'Ransomware Activity',      'Mass file writes with ransomware extensions detected',            'critical', 'T1486',     'Data Encrypted for Impact'),
  ('vss_deletion',           'VSS Shadow Deletion',      'Shadow copy deleted — common ransomware pre-encryption step',     'critical', 'T1490',     'Inhibit System Recovery'),
  ('lolbin_network_activity','LOLBin Network Activity',  'Living-off-the-land binary running with network access',          'high',     'T1218',     'System Binary Proxy Execution')
ON CONFLICT (rule_id) DO NOTHING;

-- Done
SELECT 'Windows EDR migration applied' AS status;
