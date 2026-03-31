-- Software allowlist/blocklist
CREATE TABLE IF NOT EXISTS software_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_type TEXT NOT NULL CHECK (list_type IN ('allowlist', 'blocklist')),
  app_name TEXT NOT NULL,
  app_pattern TEXT,
  reason TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS software_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  app_version TEXT,
  violation_type TEXT NOT NULL DEFAULT 'blocklist_hit',
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved BOOLEAN DEFAULT false
);

ALTER TABLE software_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE software_violations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_software_lists" ON software_lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_software_violations" ON software_violations FOR ALL USING (true) WITH CHECK (true);

-- Config key for software list mode
INSERT INTO config (key, value) VALUES ('software_list_mode', '"blocklist_only"') ON CONFLICT (key) DO NOTHING;
