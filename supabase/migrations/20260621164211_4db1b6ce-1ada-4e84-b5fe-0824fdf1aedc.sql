ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS accessibility_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_settings.accessibility_prefs IS
  'Wave 2.2 — per-rider accessibility preferences (step-free, preferShade, maxWalkMeters, lowFloor). JSONB so we can add keys without migrations as we learn what riders want.';