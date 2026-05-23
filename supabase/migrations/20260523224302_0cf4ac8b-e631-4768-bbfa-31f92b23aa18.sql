-- Phase 5 observability: per-alert-kind counters.
-- Tracks how many times each push alert kind has fired so we can spot
-- misfiring rules in production. Bounded cardinality (one row per kind).

CREATE TABLE IF NOT EXISTS public.alert_counters (
  kind text PRIMARY KEY,
  count bigint NOT NULL DEFAULT 0,
  last_fired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alert_counters ENABLE ROW LEVEL SECURITY;

-- Public read for the pulse / debug page; writes only via service role.
CREATE POLICY "Public can read alert counters"
  ON public.alert_counters
  FOR SELECT
  TO public
  USING (true);

-- Atomic increment helper. Service role calls this from the cron route.
CREATE OR REPLACE FUNCTION public.bump_alert_counter(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.alert_counters (kind, count, last_fired_at)
  VALUES (p_kind, 1, now())
  ON CONFLICT (kind)
  DO UPDATE SET
    count = public.alert_counters.count + 1,
    last_fired_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.bump_alert_counter(text) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_alert_counter(text) TO service_role;