CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'aloya-departure-tick';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'aloya-departure-tick',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aloyacy.lovable.app/api/public/hooks/departure-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $$
);