
-- Trip overrides: learning loop signal
CREATE TABLE public.trip_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  from_lat DOUBLE PRECISION NOT NULL,
  from_lng DOUBLE PRECISION NOT NULL,
  to_lat DOUBLE PRECISION NOT NULL,
  to_lng DOUBLE PRECISION NOT NULL,
  planned_legs JSONB NOT NULL,
  actual_legs JSONB,
  kind TEXT NOT NULL,
  hour SMALLINT NOT NULL,
  dow SMALLINT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_overrides_od ON public.trip_overrides (
  round(from_lat::numeric, 3),
  round(from_lng::numeric, 3),
  round(to_lat::numeric, 3),
  round(to_lng::numeric, 3),
  kind
);
CREATE INDEX idx_trip_overrides_recorded ON public.trip_overrides (recorded_at DESC);

ALTER TABLE public.trip_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all client access to trip_overrides"
ON public.trip_overrides
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Rider-contributed vehicle fixes (crowdsourced bus position)
CREATE TABLE public.rider_vehicle_fixes (
  id BIGSERIAL PRIMARY KEY,
  trip_id TEXT NOT NULL,
  route_id TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  bearing DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  device_id TEXT NOT NULL,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_rider_fixes_trip_recent ON public.rider_vehicle_fixes (trip_id, reported_at DESC);
CREATE INDEX idx_rider_fixes_reported ON public.rider_vehicle_fixes (reported_at DESC);

ALTER TABLE public.rider_vehicle_fixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read recent rider fixes"
ON public.rider_vehicle_fixes
FOR SELECT
TO public
USING (reported_at > now() - interval '2 minutes');

CREATE POLICY "Deny client writes to rider_vehicle_fixes"
ON public.rider_vehicle_fixes
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- Cleanup function (called from cron or on insert)
CREATE OR REPLACE FUNCTION public.cleanup_rider_fixes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rider_vehicle_fixes WHERE reported_at < now() - interval '5 minutes';
END;
$$;
