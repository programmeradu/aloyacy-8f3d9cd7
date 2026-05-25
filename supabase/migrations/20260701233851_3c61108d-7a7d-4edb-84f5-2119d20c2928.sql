
-- Promo codes registry
CREATE TABLE public.promo_codes (
  code text PRIMARY KEY,
  duration_days integer NOT NULL DEFAULT 7 CHECK (duration_days > 0 AND duration_days <= 90),
  max_redemptions integer,
  redemptions_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.promo_codes TO authenticated;
GRANT ALL ON public.promo_codes TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- No direct client access needed beyond validation; server fns use service role.
CREATE POLICY "authenticated may read active promo codes"
  ON public.promo_codes
  FOR SELECT TO authenticated
  USING (active = true);

CREATE TRIGGER set_promo_codes_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trial grants: enforce once-per-user AND once-per-device
CREATE TABLE public.trial_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('auto','promo')),
  promo_code text REFERENCES public.promo_codes(code) ON DELETE SET NULL,
  environment text NOT NULL,
  duration_days integer NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT trial_grants_user_env_unique UNIQUE (user_id, environment),
  CONSTRAINT trial_grants_device_env_unique UNIQUE (device_id, environment)
);

GRANT SELECT ON public.trial_grants TO authenticated;
GRANT ALL ON public.trial_grants TO service_role;

ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own trial grants"
  ON public.trial_grants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_trial_grants_user ON public.trial_grants(user_id, environment);
CREATE INDEX idx_trial_grants_device ON public.trial_grants(device_id, environment);

-- Seed a couple of demo promo codes (user can create more later)
INSERT INTO public.promo_codes (code, duration_days, notes)
VALUES
  ('ALOYA7', 7, 'Public 7-day trial code'),
  ('WELCOME7', 7, 'Onboarding email code')
ON CONFLICT (code) DO NOTHING;
