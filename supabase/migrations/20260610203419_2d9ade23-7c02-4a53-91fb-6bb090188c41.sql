-- Schedule Pulse environment feeds: marine (30min) + air quality (1h).
-- Weather is already scheduled at 15min from the previous migration.

SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('aloya-pulse-marine','aloya-pulse-air');

SELECT cron.schedule(
  'aloya-pulse-marine',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/hooks/pulse-marine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'aloya-pulse-air',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/hooks/pulse-air',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8'
    ),
    body := '{}'::jsonb
  );
  $$
);