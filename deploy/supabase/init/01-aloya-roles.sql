-- Runs once, on first boot of an empty data volume.
--
-- supabase/postgres already creates anon / authenticated / service_role /
-- authenticator and the auth+storage schemas. This file only adds what
-- Aloya specifically relies on and what a bare restore would otherwise miss.

-- Extensions the app's functions and ingestion jobs depend on.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"      WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto         WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- The Data API grants nothing on `public` by default. The restored dump
-- carries per-table GRANTs, but set the default so any table created later
-- through the app's own migrations is reachable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Realtime publication. Deliberately narrow: `subscriptions` stays out
-- because it holds Stripe identifiers, matching the hosted setup.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Let pg_cron be driven by the service role, so the Cloudflare
-- pulse-cron worker can schedule/unschedule jobs over the Data API.
GRANT USAGE ON SCHEMA cron TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO service_role;
