
SELECT cron.unschedule('aloya-snapshot-every-minute');
SELECT cron.unschedule('aloya-trip-alerts');

SELECT cron.schedule(
  'aloya-snapshot-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/snapshot',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aloya_cron_secret')
    ),
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
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aloya_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
