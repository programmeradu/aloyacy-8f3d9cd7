
ALTER TABLE public.trial_grants DROP CONSTRAINT IF EXISTS trial_grants_promo_code_fkey;
ALTER TABLE public.trial_grants DROP COLUMN IF EXISTS promo_code;
ALTER TABLE public.trial_grants DROP COLUMN IF EXISTS source;
ALTER TABLE public.trial_grants DROP COLUMN IF EXISTS duration_days;

DROP TABLE IF EXISTS public.promo_codes;
