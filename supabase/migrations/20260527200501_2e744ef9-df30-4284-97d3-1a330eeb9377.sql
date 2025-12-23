
-- 1. trip_history: PERMISSIVE deny -> RESTRICTIVE deny
DROP POLICY IF EXISTS "Deny all client access to trip_history" ON public.trip_history;
CREATE POLICY "Deny all client access to trip_history"
  ON public.trip_history
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 2. scheduled_departures: add RESTRICTIVE deny for anon (authenticated owners still allowed via permissive policies)
CREATE POLICY "Block anon access to scheduled_departures"
  ON public.scheduled_departures
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3. training_events: explicit RESTRICTIVE deny for anon + authenticated
CREATE POLICY "Deny all client access to training_events"
  ON public.training_events
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 4. walk_pace_stats: explicit RESTRICTIVE deny for anon + authenticated
CREATE POLICY "Deny all client access to walk_pace_stats"
  ON public.walk_pace_stats
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 5. Remove subscriptions from realtime publication so Stripe IDs aren't broadcast
ALTER PUBLICATION supabase_realtime DROP TABLE public.subscriptions;

-- 6. device_auth: bind anonymous device IDs to a one-time bearer token
CREATE TABLE public.device_auth (
  device_id text PRIMARY KEY,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.device_auth TO service_role;

ALTER TABLE public.device_auth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all client access to device_auth"
  ON public.device_auth
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
