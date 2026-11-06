-- Block rules: patterns that the ES sensor / minifilter will deny in real time
CREATE TABLE IF NOT EXISTS block_rules (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  rule_type   text NOT NULL CHECK (rule_type IN ('path', 'signing_id', 'team_id', 'process_name', 'hash')),
  pattern     text NOT NULL,
  action      text NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'alert')),
  platform    text NOT NULL DEFAULT 'all' CHECK (platform IN ('all', 'macos', 'windows', 'linux')),
  device_id   uuid REFERENCES devices(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT true,
  severity    text NOT NULL DEFAULT 'high' CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  description text,
  mitre_id    text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- EDR events table (populated by the ES sensor and Windows minifilter via agent)
CREATE TABLE IF NOT EXISTS edr_events (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id    uuid REFERENCES devices(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  action       text NOT NULL DEFAULT 'notify',
  pid          integer,
  ppid         integer,
  process_name text,
  process_path text,
  signing_id   text,
  file_path    text,
  threat_score float CHECK (threat_score >= 0 AND threat_score <= 1),
  mitre_id     text,
  mitre_name   text,
  raw          jsonb,
  timestamp    timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE block_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE edr_events  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon_read_block_rules"   ON block_rules FOR SELECT TO anon USING (enabled = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_insert_block_rules" ON block_rules FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_update_block_rules" ON block_rules FOR UPDATE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_delete_block_rules" ON block_rules FOR DELETE TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon_read_edr_events"   ON edr_events FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "anon_insert_edr_events" ON edr_events FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_block_rules_enabled ON block_rules(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_edr_events_device   ON edr_events(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_edr_events_threat   ON edr_events(threat_score DESC) WHERE threat_score > 0.5;

-- Default rules seeded on first install
INSERT INTO block_rules (name, rule_type, pattern, action, platform, severity, description, mitre_id) VALUES
  ('Block CSRUtil Disable',   'process_name', 'csrutil',       'block', 'macos',   'critical', 'Prevents disabling System Integrity Protection',      'T1562.001'),
  ('Block Kext Loading',      'process_name', 'kextload',      'block', 'macos',   'critical', 'Prevents unsigned kernel extension loading',           'T1215'),
  ('Block Temp Script Exec',  'path',         '/tmp/',         'alert', 'macos',   'high',     'Alert on executables launched from /tmp',              'T1059'),
  ('Block OSAScript Abuse',   'path',         'osascript',     'alert', 'all',     'high',     'Monitor AppleScript execution',                        'T1059.002'),
  ('Block PowerShell',        'process_name', 'powershell',    'alert', 'windows', 'high',     'Monitor PowerShell execution',                         'T1059.001'),
  ('Block MSHTA',             'process_name', 'mshta.exe',     'block', 'windows', 'critical', 'Block HTML Application Host abuse',                    'T1218.005'),
  ('Block Regsvr32 Abuse',    'process_name', 'regsvr32.exe',  'alert', 'windows', 'high',     'Monitor regsvr32 for living-off-the-land attacks',     'T1218.010')
ON CONFLICT DO NOTHING;
