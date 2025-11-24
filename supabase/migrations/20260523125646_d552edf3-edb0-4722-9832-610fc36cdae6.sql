-- Trip history per device for personalized suggestions.
CREATE TABLE public.trip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  from_lat double precision NOT NULL,
  from_lng double precision NOT NULL,
  from_label text NOT NULL,
  to_lat double precision NOT NULL,
  to_lng double precision NOT NULL,
  to_label text NOT NULL,
  route_short text,
  source text NOT NULL DEFAULT 'completed',
  dow smallint NOT NULL,
  hour smallint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trip_history_device_recorded_idx
  ON public.trip_history (device_id, recorded_at DESC);

ALTER TABLE public.trip_history ENABLE ROW LEVEL SECURITY;

-- Server-only access; client uses server functions with the admin client.
CREATE POLICY "Deny all client access to trip_history"
  ON public.trip_history
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);