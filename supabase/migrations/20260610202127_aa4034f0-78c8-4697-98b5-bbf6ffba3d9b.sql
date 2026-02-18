
CREATE TABLE IF NOT EXISTS public.pulse_signals (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,                  -- e.g. weather:nicosia, fixtures:cfa, cruises:limassol
  scope TEXT NOT NULL DEFAULT 'island', -- island | nicosia | limassol | larnaca | paphos | troodos | ayianapa | coast | airport-lca | airport-pfo | port-limassol
  source TEXT NOT NULL,               -- e.g. open-meteo, cfa-scrape, cruisemapper
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ttl_seconds INTEGER NOT NULL DEFAULT 900,
  UNIQUE (key, scope)
);

CREATE INDEX IF NOT EXISTS idx_pulse_signals_key_scope ON public.pulse_signals (key, scope);
CREATE INDEX IF NOT EXISTS idx_pulse_signals_fetched_at ON public.pulse_signals (fetched_at DESC);

GRANT SELECT ON public.pulse_signals TO anon, authenticated;
GRANT ALL ON public.pulse_signals TO service_role;

ALTER TABLE public.pulse_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read of pulse signals"
  ON public.pulse_signals
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.cleanup_pulse_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pulse_signals
  WHERE fetched_at < now() - make_interval(secs => ttl_seconds * 4);
END;
$$;
