-- Patch management history
CREATE TABLE IF NOT EXISTS patch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  command_id UUID,
  updates_installed TEXT[],
  updates_attempted INTEGER,
  updates_succeeded INTEGER,
  initiated_by TEXT DEFAULT 'manual',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'
);

ALTER TABLE patch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_patch_history" ON patch_history FOR ALL USING (true) WITH CHECK (true);
