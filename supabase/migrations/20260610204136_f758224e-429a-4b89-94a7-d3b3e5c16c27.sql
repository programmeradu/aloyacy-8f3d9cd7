-- Pulse transport & safety axis: Met warnings + Cruises + Flights.

SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('aloya-pulse-met-warnings','aloya-pulse-cruises','aloya-pulse-flights');

SELECT cron.schedule(
  'aloya-pulse-met-warnings',
  '13,43 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/hooks/pulse-met-warnings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cruisemapper updates overnight; pull once a day at 02:00 UTC (04:00 Cyprus).
SELECT cron.schedule(
  'aloya-pulse-cruises',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/hooks/pulse-cruises',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'aloya-pulse-flights',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/hooks/pulse-flights',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := '{}'::jsonb
  );
  $$
);