DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'aloya_cron_secret';

  IF v_secret IS NULL THEN
    v_secret := encode(gen_random_bytes(32), 'hex');
    PERFORM vault.create_secret(v_secret, 'aloya_cron_secret', 'Header secret for Aloya cron jobs');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aloya-snapshot') THEN
    PERFORM cron.unschedule('aloya-snapshot');
  END IF;

  PERFORM cron.schedule(
    'aloya-snapshot',
    '*/2 * * * *',
    format($q$
      SELECT net.http_post(
        url := 'https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c.lovable.app/api/public/snapshot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
    $q$, v_secret)
  );
END $$;