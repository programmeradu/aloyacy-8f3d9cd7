-- C2 device reputation. Mirror of deploy/supabase/sql/20260828_device_reputation.sql.

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
