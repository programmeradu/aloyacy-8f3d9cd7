CREATE OR REPLACE FUNCTION public.pulse_hour_strip()
RETURNS TABLE(hour_of_day integer, sample_count bigint, mean_delay_sec double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    hour_of_day::int AS hour_of_day,
    SUM(sample_count)::bigint AS sample_count,
    (SUM(mean_delay_sec * sample_count) / NULLIF(SUM(sample_count), 0))::double precision AS mean_delay_sec
  FROM public.delay_stats
  GROUP BY hour_of_day
  ORDER BY hour_of_day;
$$;
GRANT EXECUTE ON FUNCTION public.pulse_hour_strip() TO anon, authenticated, service_role;