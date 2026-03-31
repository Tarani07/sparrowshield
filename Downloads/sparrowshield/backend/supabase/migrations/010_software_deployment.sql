-- Software catalog and deployment
CREATE TABLE IF NOT EXISTS software_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bundle_id TEXT,
  install_method TEXT NOT NULL DEFAULT 'brew',
  install_command TEXT,
  uninstall_command TEXT,
  version TEXT,
  category TEXT DEFAULT 'Utility',
  icon_url TEXT,
  platform TEXT DEFAULT 'both'
);

CREATE TABLE IF NOT EXISTS deployment_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  software_id UUID REFERENCES software_catalog(id) ON DELETE SET NULL,
  software_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('install', 'uninstall')),
  method TEXT DEFAULT 'brew',
  status TEXT DEFAULT 'pending',
  result TEXT,
  initiated_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE software_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_software_catalog" ON software_catalog FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_deployment_tasks" ON deployment_tasks FOR ALL USING (true) WITH CHECK (true);

-- Seed popular software
INSERT INTO software_catalog (name, bundle_id, install_method, category, platform) VALUES
  ('Google Chrome', 'com.google.Chrome', 'brew', 'Browser', 'both'),
  ('Firefox', 'org.mozilla.firefox', 'brew', 'Browser', 'both'),
  ('Slack', 'com.tinyspeck.slackmacgap', 'brew', 'Communication', 'both'),
  ('Zoom', 'us.zoom.xos', 'brew', 'Communication', 'both'),
  ('Visual Studio Code', 'com.microsoft.VSCode', 'brew', 'Development', 'both'),
  ('1Password', 'com.1password.1password', 'brew', 'Security', 'both'),
  ('Docker Desktop', 'com.docker.docker', 'brew', 'Development', 'mac'),
  ('iTerm2', 'com.googlecode.iterm2', 'brew', 'Development', 'mac'),
  ('Rectangle', 'com.knollsoft.Rectangle', 'brew', 'Utility', 'mac'),
  ('Notion', 'notion.id', 'brew', 'Productivity', 'both'),
  ('Microsoft Teams', 'com.microsoft.teams2', 'brew', 'Communication', 'both'),
  ('Postman', 'com.postmanlabs.mac', 'brew', 'Development', 'both')
ON CONFLICT DO NOTHING;
