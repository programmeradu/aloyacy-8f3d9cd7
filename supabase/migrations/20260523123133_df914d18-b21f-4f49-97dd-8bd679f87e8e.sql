
CREATE TABLE public.active_trips (
  device_id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  route_short TEXT,
  board_stop_id TEXT,
  board_name TEXT,
  board_unix BIGINT,
  alight_stop_id TEXT,
  alight_name TEXT,
  alight_unix BIGINT,
  walk_in_sec INTEGER NOT NULL DEFAULT 0,
  walk_out_sec INTEGER NOT NULL DEFAULT 0,
  alerts_sent TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.active_trips ENABLE ROW LEVEL SECURITY;

-- Clients never touch this table directly; server functions use the admin client.
CREATE POLICY "Deny all client access to active_trips"
ON public.active_trips
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE INDEX idx_active_trips_updated_at ON public.active_trips(updated_at DESC);
CREATE INDEX idx_active_trips_alight_unix ON public.active_trips(alight_unix);
