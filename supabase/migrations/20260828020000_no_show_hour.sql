-- B3 no-show hour buckets. Mirror of deploy/supabase/sql/20260828_no_show_hour.sql.

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
