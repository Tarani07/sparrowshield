-- SparrowShield v2.1 — AV Engine, Web Filter, App Filter, Device Groups
-- RLS model: agents (anon) read rules + write results; dashboard (authenticated) manages everything.

-- ── 1. Device Groups ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS device_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  color       TEXT DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_group_members (
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  group_id  UUID NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  added_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (device_id, group_id)
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES device_groups(id) ON DELETE SET NULL;

INSERT INTO device_groups (name, description, color) VALUES
  ('Engineering', 'Engineering and development team devices', '#6366f1'),
  ('Finance',     'Finance and accounting team devices',      '#10b981'),
  ('HR',          'Human resources team devices',             '#f59e0b'),
  ('Executive',   'C-suite and leadership devices',           '#ef4444'),
  ('Marketing',   'Marketing team devices',                   '#8b5cf6'),
  ('IT Admin',    'IT administrator workstations',            '#06b6d4')
ON CONFLICT (name) DO NOTHING;


-- ── 2. Web Filter Rules (custom whitelist / blacklist) ───────────────────────
CREATE TABLE IF NOT EXISTS web_filter_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT NOT NULL,
  action      TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'allow')),
  category    TEXT DEFAULT 'custom',
  group_id    UUID REFERENCES device_groups(id) ON DELETE CASCADE,  -- NULL = all devices
  notes       TEXT,
  created_by  TEXT,
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_filter_domain ON web_filter_rules(domain);
CREATE INDEX IF NOT EXISTS idx_web_filter_group  ON web_filter_rules(group_id);


-- ── 3. Web Categories (adult, gambling, gaming, malware, ...) ────────────────
CREATE TABLE IF NOT EXISTS web_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  blocklist_url TEXT,
  enabled       BOOLEAN DEFAULT false,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

INSERT INTO web_categories (name, description, blocklist_url, enabled) VALUES
  ('malware',       'Known malware distribution sites',         'https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt',    true),
  ('phishing',      'Phishing and credential harvesting sites', 'https://raw.githubusercontent.com/blocklistproject/Lists/master/phishing.txt',   true),
  ('ransomware',    'Known ransomware C2 domains',              'https://raw.githubusercontent.com/blocklistproject/Lists/master/ransomware.txt', true),
  ('crypto_mining', 'Cryptomining scripts and pools',           'https://raw.githubusercontent.com/blocklistproject/Lists/master/crypto.txt',     true),
  ('adult',         'Adult and pornographic content',           'https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt',       false),
  ('gambling',      'Online gambling and betting sites',        'https://raw.githubusercontent.com/blocklistproject/Lists/master/gambling.txt',   false),
  ('gaming',        'Online gaming platforms',                  'https://raw.githubusercontent.com/blocklistproject/Lists/master/gaming.txt',     false),
  ('social',        'Social media platforms',                   'https://raw.githubusercontent.com/blocklistproject/Lists/master/facebook.txt',   false),
  ('tracking',      'Ad tracking and analytics domains',        'https://raw.githubusercontent.com/blocklistproject/Lists/master/tracking.txt',   false)
ON CONFLICT (name) DO NOTHING;


-- ── 4. AV Scan Results ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS av_scan_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         UUID REFERENCES devices(id) ON DELETE CASCADE,
  hostname          TEXT,
  scan_type         TEXT NOT NULL DEFAULT 'quick',
  status            TEXT NOT NULL DEFAULT 'clean' CHECK (status IN ('clean', 'threats_found', 'scanning')),
  threats_found     INTEGER DEFAULT 0,
  files_scanned     INTEGER DEFAULT 0,
  scan_duration_sec INTEGER,
  threats           JSONB DEFAULT '[]',
  scanned_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_av_scan_device ON av_scan_results(device_id, scanned_at DESC);


-- ── 5. Group-aware app rules ─────────────────────────────────────────────────
ALTER TABLE software_lists ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES device_groups(id) ON DELETE CASCADE;
ALTER TABLE software_lists ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'all';


-- ── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE device_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_filter_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE av_scan_results      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "anon_read_device_groups"   ON device_groups        FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_group_members"   ON device_group_members FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_web_filter"      ON web_filter_rules     FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_read_web_categories"  ON web_categories       FOR SELECT TO anon USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "anon_insert_av_scans"      ON av_scan_results      FOR INSERT TO anon WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "auth_manage_device_groups"  ON device_groups        FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_manage_group_members"  ON device_group_members FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_manage_web_filter"     ON web_filter_rules     FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_manage_web_categories" ON web_categories       FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "auth_manage_av_scans"       ON av_scan_results      FOR ALL TO authenticated USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON device_groups, device_group_members, web_filter_rules, web_categories TO anon;
GRANT INSERT ON av_scan_results TO anon;
GRANT ALL ON device_groups, device_group_members, web_filter_rules, web_categories, av_scan_results TO authenticated;
