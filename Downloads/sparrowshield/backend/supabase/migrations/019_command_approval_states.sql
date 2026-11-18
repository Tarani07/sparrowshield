-- Admin-approval workflow: check-alerts creates commands as 'awaiting_approval'; approve-command
-- moves them to 'pending' (agents only poll 'pending', so these stay dormant) or 'dismissed'.
ALTER TABLE device_commands DROP CONSTRAINT IF EXISTS device_commands_status_check;
ALTER TABLE device_commands ADD CONSTRAINT device_commands_status_check
  CHECK (status IN ('pending', 'running', 'done', 'failed', 'awaiting_approval', 'approved', 'dismissed'));

-- Settings saves the Slack webhook as 'slack_webhook_url'; check-alerts and approve-command read
-- 'slack_webhook'. Keep the legacy key mirrored so both paths notify.
CREATE OR REPLACE FUNCTION mirror_slack_webhook() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.key = 'slack_webhook_url' THEN
    INSERT INTO config (key, value) VALUES ('slack_webhook', NEW.value)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mirror_slack_webhook ON config;
CREATE TRIGGER trg_mirror_slack_webhook AFTER INSERT OR UPDATE ON config
  FOR EACH ROW WHEN (NEW.key = 'slack_webhook_url') EXECUTE FUNCTION mirror_slack_webhook();
INSERT INTO config (key, value)
  SELECT 'slack_webhook', value FROM config WHERE key = 'slack_webhook_url'
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
