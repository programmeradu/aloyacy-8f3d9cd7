
DROP FUNCTION IF EXISTS public.get_trip_group_view(text);

CREATE OR REPLACE FUNCTION public.get_trip_group_view(p_code text, p_member_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_row public.trip_groups%ROWTYPE;
  members_json jsonb;
  me_id uuid;
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

  IF p_member_token IS NOT NULL THEN
    SELECT id INTO me_id
    FROM public.trip_group_members
    WHERE group_id = g_row.id AND member_token = p_member_token;
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
    'me_id', me_id,
    'members', members_json
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_trip_group_view(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trip_group_view(text, text) TO anon, authenticated, service_role;
