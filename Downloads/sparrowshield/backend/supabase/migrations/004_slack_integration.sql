-- Slack integration: notification config + device offline tracking

ALTER TABLE devices ADD COLUMN IF NOT EXISTS notified_offline boolean DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS prev_installed_apps jsonb DEFAULT '[]'::jsonb;

INSERT INTO config (key, value) VALUES
  ('slack_webhook_url', '""'::jsonb),
  ('slack_notify_new_app', 'true'::jsonb),
  ('slack_notify_system_critical', 'true'::jsonb),
  ('slack_notify_security_alert', 'true'::jsonb),
  ('slack_notify_device_offline', 'true'::jsonb),
  ('slack_notify_disk_health', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
