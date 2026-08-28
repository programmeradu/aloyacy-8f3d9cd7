-- D2 — a completed visit at a stop: served (dwelt) or skipped (passed
-- through). Written when A2 interpolates a geofence cross, while pings
-- are still in the 3-hour window. The stop card tallies 14 days and
-- stays silent below 8 visits or 15%.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_stop_skip.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.stop_skip_visits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id         text NOT NULL,
  route_id        text NOT NULL,
  trip_id         text NOT NULL,
  outcome         text NOT NULL,
  dwell_sec       integer NOT NULL DEFAULT 0,
  classified_at   timestamptz NOT NULL DEFAULT now(),
  hour_of_day     smallint,
  day_of_week     smallint,
  UNIQUE (trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS stop_skip_visits_stop_idx
  ON public.stop_skip_visits (stop_id, route_id, classified_at DESC);

GRANT ALL ON public.stop_skip_visits TO service_role;
ALTER TABLE public.stop_skip_visits ENABLE ROW LEVEL SECURITY;

COMMIT;
