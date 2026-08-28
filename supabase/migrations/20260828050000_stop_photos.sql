-- D1 — one rider photo per stop. Append-only. The API shows the latest.
-- Storage bucket `stop-photos` is created lazily by the upload path
-- (same pattern as the schedule bucket). Moderation is ops; don't block.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_stop_photos.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.stop_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id    text NOT NULL,
  device_id  text NOT NULL,
  path       text NOT NULL,
  mime       text NOT NULL,
  bytes      integer NOT NULL,
  taken_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stop_photos_stop_idx
  ON public.stop_photos (stop_id, taken_at DESC);

CREATE INDEX IF NOT EXISTS stop_photos_rate_idx
  ON public.stop_photos (device_id, stop_id, taken_at DESC);

GRANT ALL ON public.stop_photos TO service_role;
ALTER TABLE public.stop_photos ENABLE ROW LEVEL SECURITY;

COMMIT;
