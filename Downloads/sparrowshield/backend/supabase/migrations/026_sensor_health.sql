-- Sensor health: agents report the state of each hardware sensor (Touch ID, ambient light,
-- lid angle, motion, camera, mic, battery, thermal, radios…). report_sensors() stores it and
-- turns faults into alerts + a Slack message; it auto-resolves when the sensor recovers.
--
-- A sensor is only treated as faulty if it has worked on that device before (last_ok_at set),
-- so hardware a model never had (no lid sensor on a Mac mini) never alerts.

CREATE TABLE IF NOT EXISTS public.device_sensors (
  device_id   uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  sensor      text NOT NULL,
  category    text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL CHECK (status IN ('ok','warning','error','not_present','unknown')),
  detail      text,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, sensor)
);
CREATE INDEX IF NOT EXISTS idx_device_sensors_status ON public.device_sensors(status);

ALTER TABLE public.device_sensors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS console_member_read ON public.device_sensors;
CREATE POLICY console_member_read ON public.device_sensors FOR SELECT TO authenticated USING (is_console_member());
DROP POLICY IF EXISTS console_admin_write ON public.device_sensors;
CREATE POLICY console_admin_write ON public.device_sensors FOR ALL TO authenticated
  USING (is_console_admin()) WITH CHECK (is_console_admin());
-- No anon policy: agents write only through report_sensors().

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.device_sensors;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.config (key, value) VALUES ('slack_notify_sensor_health', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;


CREATE OR REPLACE FUNCTION public._sensor_slack(p_text text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hook text; enabled boolean;
BEGIN
  SELECT value #>> '{}' INTO hook FROM config WHERE key = 'slack_webhook_url';
  SELECT COALESCE((value #>> '{}')::boolean, true) INTO enabled FROM config WHERE key = 'slack_notify_sensor_health';
  IF COALESCE(enabled, true) AND hook LIKE 'https://hooks.slack.com/%' THEN
    PERFORM net.http_post(url := hook, body := jsonb_build_object('text', p_text),
                          headers := '{"Content-Type":"application/json"}'::jsonb);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sensor slack notify failed: %', SQLERRM;   -- never fail the agent's report over Slack
END $$;
REVOKE ALL ON FUNCTION public._sensor_slack(text) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.report_sensors(p_device_id uuid, p_sensors jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dev        record;
  s          jsonb;
  prev       record;
  had_prev   boolean;
  k          text;
  st         text;
  nm         text;
  det        text;
  rule       text;
  link       text := 'https://sparrowshield.vercel.app/device/' || p_device_id;
  who        text;
  opened     int := 0;
  closed     int := 0;
  n          int;
BEGIN
  SELECT id, hostname, COALESCE(assigned_user, active_user) AS person INTO dev FROM devices WHERE id = p_device_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown device'; END IF;
  IF jsonb_typeof(p_sensors) <> 'array' OR jsonb_array_length(p_sensors) > 60 THEN
    RAISE EXCEPTION 'p_sensors must be an array of at most 60 sensors';
  END IF;
  who := dev.hostname || COALESCE(' (' || dev.person || ')', '');

  FOR s IN SELECT * FROM jsonb_array_elements(p_sensors) LOOP
    k := s->>'sensor';
    CONTINUE WHEN k IS NULL OR k !~ '^[a-z0-9_]{1,40}$';
    st  := COALESCE(s->>'status', 'unknown');
    IF st NOT IN ('ok','warning','error','not_present','unknown') THEN st := 'unknown'; END IF;
    nm  := left(COALESCE(s->>'name', k), 80);
    det := left(s->>'detail', 300);

    SELECT * INTO prev FROM device_sensors WHERE device_id = p_device_id AND sensor = k;
    had_prev := FOUND;
    -- Something that used to work and has disappeared is a hardware fault, not "not present".
    IF st = 'not_present' AND had_prev AND prev.last_ok_at IS NOT NULL THEN
      st  := 'error';
      det := 'No longer detected by macOS/Windows — last working ' || to_char(prev.last_ok_at AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI') || ' UTC';
    END IF;

    INSERT INTO device_sensors AS d (device_id, sensor, category, name, status, detail, value, last_ok_at, changed_at, updated_at)
    VALUES (p_device_id, k, left(COALESCE(s->>'category', 'other'), 40), nm, st, det,
            CASE WHEN jsonb_typeof(s->'value') = 'object' THEN s->'value' ELSE '{}'::jsonb END,
            CASE WHEN st = 'ok' THEN now() END, now(), now())
    ON CONFLICT (device_id, sensor) DO UPDATE SET
      category   = EXCLUDED.category,
      name       = EXCLUDED.name,
      status     = EXCLUDED.status,
      detail     = EXCLUDED.detail,
      value      = EXCLUDED.value,
      last_ok_at = CASE WHEN EXCLUDED.status = 'ok' THEN now() ELSE d.last_ok_at END,
      changed_at = CASE WHEN EXCLUDED.status IS DISTINCT FROM d.status THEN now() ELSE d.changed_at END,
      updated_at = now();

    rule := 'sensor:' || k;
    IF st IN ('warning','error') THEN
      IF NOT EXISTS (SELECT 1 FROM alerts WHERE device_id = p_device_id AND rule_id = rule AND NOT resolved) THEN
        INSERT INTO alerts (device_id, alert_type, severity, message, rule_id, resolved)
        VALUES (p_device_id, 'sensor_health', CASE WHEN st = 'error' THEN 'high' ELSE 'medium' END,
                nm || ' sensor ' || CASE WHEN st = 'error' THEN 'failure' ELSE 'warning' END || ' on ' || dev.hostname
                   || COALESCE(' — ' || det, ''),
                rule, false);
        opened := opened + 1;
        -- Don't re-page for a sensor that flapped back within the hour.
        IF NOT EXISTS (SELECT 1 FROM alerts WHERE device_id = p_device_id AND rule_id = rule AND resolved
                         AND resolved_at > now() - interval '1 hour') THEN
          PERFORM _sensor_slack(
            CASE WHEN st = 'error' THEN ':rotating_light: *[HIGH]* ' ELSE ':warning: *[MEDIUM]* ' END
            || '*' || nm || '* sensor ' || CASE WHEN st = 'error' THEN 'failure' ELSE 'warning' END
            || ' on ' || who || COALESCE(E'\n>' || det, '') || E'\n<' || link || '|Open device in SparrowShield>');
        END IF;
      END IF;
    ELSIF st = 'ok' THEN
      UPDATE alerts SET resolved = true, resolved_at = now()
       WHERE device_id = p_device_id AND rule_id = rule AND NOT resolved;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        closed := closed + n;
        PERFORM _sensor_slack(':white_check_mark: *' || nm || '* sensor is working again on ' || who);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('opened', opened, 'resolved', closed);
END $$;

REVOKE ALL ON FUNCTION public.report_sensors(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_sensors(uuid, jsonb) TO anon, authenticated;
