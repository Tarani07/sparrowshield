-- HealSparrow Migration 002
-- AI Reporting Agent: device_health_reports table + config entries

-- ── device_health_reports ─────────────────────────────────────────────────────
-- One row written per device per reporting-agent run (every 15 min).
-- Stores the AI-generated health status, score, summary, and culprit apps.

CREATE TABLE device_health_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  health_status    text NOT NULL CHECK (health_status IN ('healthy', 'warning', 'critical')),
  health_score     int  NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  summary          text NOT NULL,
  culprit_apps     jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_reports_device_time ON device_health_reports(device_id, generated_at DESC);
CREATE INDEX idx_health_reports_status      ON device_health_reports(health_status, generated_at DESC);

-- RLS: dashboard (anon key) can read; Edge Functions use service_role (bypasses RLS)
ALTER TABLE device_health_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon read device_health_reports"
  ON device_health_reports FOR SELECT TO anon USING (true);

-- ── Hardware fields on devices ────────────────────────────────────────────────
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_model   text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cpu_cores   int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ram_total_gb float;

-- ── Data retention: purge old rows daily ─────────────────────────────────────
-- Keeps last 7 days of health reports and 30 days of metrics.
-- Requires pg_cron extension (enabled by default on Supabase Pro).

SELECT cron.schedule(
  'healsparrow-purge-health-reports',
  '30 2 * * *',
  $$ DELETE FROM device_health_reports WHERE generated_at < now() - INTERVAL '7 days'; $$
);

SELECT cron.schedule(
  'healsparrow-purge-metrics',
  '0 2 * * *',
  $$ DELETE FROM metrics WHERE timestamp < now() - INTERVAL '30 days'; $$
);

SELECT cron.schedule(
  'healsparrow-purge-processes',
  '15 2 * * *',
  $$ DELETE FROM processes WHERE timestamp < now() - INTERVAL '7 days'; $$
);

-- Indexes to speed up retention purges
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp   ON metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_processes_timestamp ON processes(timestamp);

-- ── Config entries ────────────────────────────────────────────────────────────
INSERT INTO config (key, value) VALUES
  ('reporting_agent_enabled', 'true'::jsonb),
  ('health_score_thresholds', '{
    "ram_warning": 80,
    "ram_critical": 90,
    "cpu_warning": 75,
    "cpu_critical": 90,
    "disk_warning": 80,
    "disk_critical": 92,
    "battery_warning": 40,
    "culprit_ram_mb": 512
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Schedule reporting-agent cron (every 15 min) ──────────────────────────────
-- Calls the reporting-agent Edge Function via pg_net (Supabase built-in).
-- Replace YOUR_PROJECT_REF with actual Supabase project ref before applying.

-- SELECT cron.schedule(
--   'healsparrow-reporting-agent',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/reporting-agent',
--     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );
