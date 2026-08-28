-- B3: stamp Cyprus hour/dow on trip_no_shows so the stop card can say
-- "this 18:40 didn't run on 6 of the last 20 weekdays" after trip_ids churn.
--
-- Apply:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_no_show_hour.sql

BEGIN;

ALTER TABLE public.trip_no_shows
  ADD COLUMN IF NOT EXISTS hour_of_day smallint,
  ADD COLUMN IF NOT EXISTS day_of_week smallint;

UPDATE public.trip_no_shows
SET
  hour_of_day = EXTRACT(HOUR FROM detected_at AT TIME ZONE 'Asia/Nicosia')::smallint,
  day_of_week = EXTRACT(DOW FROM detected_at AT TIME ZONE 'Asia/Nicosia')::smallint
WHERE hour_of_day IS NULL;

CREATE INDEX IF NOT EXISTS trip_no_shows_route_hour_idx
  ON public.trip_no_shows (route_id, hour_of_day, day_of_week, service_date);

COMMIT;
