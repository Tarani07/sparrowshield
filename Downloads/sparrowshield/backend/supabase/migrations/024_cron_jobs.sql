-- Hourly background jobs. pg_cron runs as postgres; each job posts to an edge function with the
-- internal cron secret (the anon key only satisfies the gateway's JWT check — it grants nothing).
CREATE OR REPLACE FUNCTION call_edge_function(fn text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE secret text; req bigint;
BEGIN
  SELECT value INTO secret FROM internal_secrets WHERE name = 'cron_secret';
  SELECT net.http_post(
    url     := 'https://hevcfhxmjgbpozqtescm.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret,
                                  'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO req;
  RETURN req;
END $$;
REVOKE ALL ON FUNCTION call_edge_function(text) FROM public, anon, authenticated;

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('ss-compliance-hourly', 'ss-reports-hourly', 'ss-jumpcloud-hourly');
SELECT cron.schedule('ss-compliance-hourly', '10 * * * *', $$SELECT call_edge_function('compliance-evaluate')$$);
SELECT cron.schedule('ss-reports-hourly',    '2 * * * *',  $$SELECT call_edge_function('send-reports')$$);
SELECT cron.schedule('ss-jumpcloud-hourly',  '20 * * * *', $$SELECT call_edge_function('jumpcloud-sync')$$);
