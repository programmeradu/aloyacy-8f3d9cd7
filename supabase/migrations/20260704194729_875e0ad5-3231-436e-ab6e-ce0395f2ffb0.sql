
CREATE OR REPLACE FUNCTION public.pulse_hour_strip()
RETURNS TABLE(hour_of_day integer, sample_count bigint, mean_delay_sec double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(HOUR FROM (captured_at AT TIME ZONE 'Asia/Nicosia'))::int AS hour_of_day,
    COUNT(*)::bigint AS sample_count,
    AVG(delay_sec)::double precision AS mean_delay_sec
  FROM public.rt_snapshots
  WHERE captured_at >= now() - interval '24 hours'
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE EXECUTE ON FUNCTION public.pulse_hour_strip() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_hour_strip() TO service_role;
