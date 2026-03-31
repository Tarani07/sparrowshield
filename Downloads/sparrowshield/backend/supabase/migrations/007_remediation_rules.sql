-- Auto-remediation rules engine
CREATE TABLE IF NOT EXISTS remediation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT '>',
  threshold NUMERIC NOT NULL,
  consecutive_beats INTEGER NOT NULL DEFAULT 2,
  action_type TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}',
  scope TEXT DEFAULT 'all',
  scope_value TEXT,
  cooldown_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS remediation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES remediation_rules(id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  command_id UUID,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  metric_value NUMERIC,
  action_type TEXT NOT NULL,
  status TEXT DEFAULT 'triggered'
);

CREATE TABLE IF NOT EXISTS remediation_beat_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES remediation_rules(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  consecutive_count INTEGER DEFAULT 0,
  last_checked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rule_id, device_id)
);

ALTER TABLE remediation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_beat_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_remediation_rules" ON remediation_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_remediation_log" ON remediation_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_remediation_beat_tracker" ON remediation_beat_tracker FOR ALL USING (true) WITH CHECK (true);
