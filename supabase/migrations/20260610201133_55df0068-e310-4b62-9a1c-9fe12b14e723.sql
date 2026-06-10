DO $$
DECLARE v text;
BEGIN
  SELECT decrypted_secret INTO v FROM vault.decrypted_secrets WHERE name = 'aloya_cron_secret';
  RAISE NOTICE 'aloya_cron_secret length=%, preview=%', length(v), left(v,8);
END $$;