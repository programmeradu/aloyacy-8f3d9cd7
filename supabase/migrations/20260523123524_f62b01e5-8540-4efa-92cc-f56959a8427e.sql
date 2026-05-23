
-- Generate a strong random secret and store in vault if not already present.
DO $$
DECLARE
  v_id uuid;
  v_secret text;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'aloya_cron_secret';
  IF v_id IS NULL THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'aloya_cron_secret', 'Header secret for /api/public/trip-alerts cron job');
  END IF;
END $$;

-- (Re)schedule the cron job. Reads the secret from vault at call time.
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'aloya_cron_secret';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aloya-trip-alerts') THEN
    PERFORM cron.unschedule('aloya-trip-alerts');
  END IF;

  PERFORM cron.schedule(
    'aloya-trip-alerts',
    '* * * * *',
    format($q$
      SELECT net.http_post(
        url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/trip-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
    $q$, v_secret)
  );
END $$;
