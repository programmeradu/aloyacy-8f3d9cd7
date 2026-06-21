-- Wave 1.1: rider-confirmed bus sightings.
-- A "sighting" = a rider at a stop taps "I see this bus" to confirm a
-- ghost/stale trip is real and present. Used to upgrade trip freshness
-- from "ghost"/"predicted" to "rider-confirmed" for ~90s.
--
-- Device-scoped (no auth). Writes go through /api/public/sighting via the
-- service-role client after rate-limiting + payload validation. We never
-- expose this table to anon/authenticated — riders consume the aggregate
-- through the realtime snapshot only.

CREATE TABLE public.bus_sightings (
  id          bigserial PRIMARY KEY,
  trip_id     text NOT NULL,
  route_id    text,
  stop_id     text,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  device_id   text NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bus_sightings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bus_sightings_id_seq TO service_role;

ALTER TABLE public.bus_sightings ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies on purpose: clients never read or write
-- this table directly. The service role bypasses RLS for the API endpoint.

CREATE INDEX bus_sightings_trip_recent_idx
  ON public.bus_sightings (trip_id, reported_at DESC);

CREATE INDEX bus_sightings_device_trip_idx
  ON public.bus_sightings (device_id, trip_id, reported_at DESC);

-- Best-effort sweeper. Sightings older than 10 min are useless — the trust
-- window is ~90s. We keep a little extra for diagnostic backfills.
CREATE OR REPLACE FUNCTION public.cleanup_bus_sightings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.bus_sightings
  WHERE reported_at < now() - interval '10 minutes';
END;
$$;