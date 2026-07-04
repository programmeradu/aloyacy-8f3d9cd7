
-- 1) rider_vehicle_fixes: server-only reads
DROP POLICY IF EXISTS "Public can read recent rider fixes" ON public.rider_vehicle_fixes;

-- 2) weather_delay_coupling: server-only reads
DROP POLICY IF EXISTS "Public can read weather_delay_coupling" ON public.weather_delay_coupling;

-- 3) Remove sensitive tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.subscriptions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.trip_group_members;

-- 4) Lock direct client SELECT on trip_groups / trip_group_members / shared_trips
DROP POLICY IF EXISTS "trip_groups read all" ON public.trip_groups;
DROP POLICY IF EXISTS "trip_group_members read all" ON public.trip_group_members;
DROP POLICY IF EXISTS "shared_trips read all" ON public.shared_trips;

-- Owner-scoped read paths so signed-in users can still see their own rows.
CREATE POLICY "trip_groups read own"
  ON public.trip_groups FOR SELECT TO authenticated
  USING (created_by_id = auth.uid());

CREATE POLICY "trip_group_members read own"
  ON public.trip_group_members FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "shared_trips read own"
  ON public.shared_trips FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

-- 5) Capability-based read RPCs (SECURITY DEFINER, sanitized columns)
CREATE OR REPLACE FUNCTION public.get_trip_group_view(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_row public.trip_groups%ROWTYPE;
  members_json jsonb;
BEGIN
  IF p_code IS NULL OR length(p_code) < 4 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO g_row
  FROM public.trip_groups
  WHERE code = upper(p_code)
    AND expires_at > now();
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY (to_jsonb(m)->>'joined_at')), '[]'::jsonb)
    INTO members_json
  FROM (
    SELECT id, group_id, display_name, origin_label,
           last_lat, last_lng, last_updated,
           eta_minutes, status, is_creator, joined_at
    FROM public.trip_group_members
    WHERE group_id = g_row.id
  ) m;

  RETURN jsonb_build_object(
    'id', g_row.id,
    'code', g_row.code,
    'destination_label', g_row.destination_label,
    'destination_lat', g_row.destination_lat,
    'destination_lng', g_row.destination_lng,
    'created_by_name', g_row.created_by_name,
    'created_at', g_row.created_at,
    'expires_at', g_row.expires_at,
    'members', members_json
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_trip_group_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_group_view(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_shared_trip_view(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(t)
  FROM (
    SELECT id, token, origin_label, destination_label,
           destination_lat, destination_lng,
           last_lat, last_lng, last_updated,
           eta_minutes, status, created_at, expires_at
    FROM public.shared_trips
    WHERE token = p_token
      AND expires_at > now()
    LIMIT 1
  ) t;
$$;
REVOKE ALL ON FUNCTION public.get_shared_trip_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_trip_view(text) TO anon, authenticated, service_role;

-- 6) bus_sightings / expo_push_tokens: make service-role-only intent explicit.
CREATE POLICY "Deny client writes bus_sightings"
  ON public.bus_sightings FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client access expo_push_tokens"
  ON public.expo_push_tokens FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 7) Revoke EXECUTE on internal SECURITY DEFINER helpers from public roles.
REVOKE EXECUTE ON FUNCTION public.cleanup_bus_sightings()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_pulse_signals()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rider_fixes()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_alert_counter(text)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake()                    FROM PUBLIC, anon, authenticated;

-- 8) Pin search_path on functions that don't have it configured.
ALTER FUNCTION public.enqueue_email(text, jsonb)                       SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint)                       SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)           SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer)         SET search_path = public;
