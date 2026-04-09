CREATE TABLE public.expo_push_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  expo_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
  app_version TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expo_push_tokens_token_idx ON public.expo_push_tokens (expo_token);
GRANT ALL ON public.expo_push_tokens TO service_role;
ALTER TABLE public.expo_push_tokens ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: writes happen via service-role from the
-- public registration endpoint after device-id validation; clients never
-- read this table directly.