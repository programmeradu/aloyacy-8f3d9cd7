CREATE OR REPLACE FUNCTION public.pulse_route_stats()
RETURNS TABLE (route_id text, sum_delay_weighted double precision, sample_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT route_id,
         SUM(mean_delay_sec * sample_count)::double precision AS sum_delay_weighted,
         SUM(sample_count)::bigint AS sample_count
  FROM public.delay_stats
  WHERE sample_count >= 3
  GROUP BY route_id;
$$;

GRANT EXECUTE ON FUNCTION public.pulse_route_stats() TO anon, authenticated;