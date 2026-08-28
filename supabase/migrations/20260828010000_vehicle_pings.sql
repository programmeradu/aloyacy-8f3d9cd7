-- A2 vehicle-cross pings. Mirror of deploy/supabase/sql/20260828_vehicle_pings.sql.

CREATE TABLE IF NOT EXISTS public.vehicle_pings (
  id            bigserial PRIMARY KEY,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  trip_id       text NOT NULL,
  route_id      text NOT NULL DEFAULT '',
  vehicle_id    text NOT NULL DEFAULT '',
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  bearing       real,
  speed_mps     real,
  source        text NOT NULL DEFAULT 'feed'
);

CREATE INDEX IF NOT EXISTS vehicle_pings_trip_time_idx
  ON public.vehicle_pings (trip_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_pings_captured_idx
  ON public.vehicle_pings (captured_at);

GRANT ALL ON public.vehicle_pings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.vehicle_pings_id_seq TO service_role;
ALTER TABLE public.vehicle_pings ENABLE ROW LEVEL SECURITY;
