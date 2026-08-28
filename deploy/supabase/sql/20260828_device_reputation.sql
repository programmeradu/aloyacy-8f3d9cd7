-- C2 — per-device reputation from GPS vs arrival_truth.
-- High n + high score can carry a lone rider-confirmed tap.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_device_reputation.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.device_reputation (
  device_id   text PRIMARY KEY,
  score       real NOT NULL,
  n           integer NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_reputation_updated_idx
  ON public.device_reputation (updated_at DESC);

GRANT ALL ON public.device_reputation TO service_role;
ALTER TABLE public.device_reputation ENABLE ROW LEVEL SECURITY;

COMMIT;
