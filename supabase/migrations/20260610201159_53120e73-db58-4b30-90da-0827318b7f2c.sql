
SELECT cron.unschedule('aloya-snapshot-every-minute');
SELECT cron.unschedule('aloya-trip-alerts');

SELECT cron.schedule(
  'aloya-snapshot-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/snapshot',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

SELECT cron.schedule(
  'aloya-trip-alerts',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/trip-alerts',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NTg3NzcsImV4cCI6MjA5NTAzNDc3N30.0bicBpmZh3XFuc_vp3x-SA_Q4bWGo62_pYRMGyJOBp8"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
