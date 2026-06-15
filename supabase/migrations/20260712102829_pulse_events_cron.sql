-- Schedule the visitcyprus events ingest daily at 03:00 UTC (05:00 Cyprus).
-- Firecrawl is called once per day; today.functions.ts reads the cached row.
SELECT cron.unschedule(jobname)
FROM cron.job WHERE jobname = 'aloya-pulse-events';

SELECT cron.schedule(
  'aloya-pulse-events',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/hooks/pulse-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := '{}'::jsonb
  );
  $$
);
