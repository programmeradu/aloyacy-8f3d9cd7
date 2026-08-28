-- D1 — stop condition. Current consensus per (stop × attribute) and
-- append-only rider reports. Photos stay a later slice.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_stop_condition.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.stop_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id      text NOT NULL,
  device_id    text NOT NULL,
  attribute    text NOT NULL,
  value        text NOT NULL,
  reported_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stop_reports_lookup_idx
  ON public.stop_reports (stop_id, attribute, reported_at DESC);

CREATE INDEX IF NOT EXISTS stop_reports_rate_idx
  ON public.stop_reports (device_id, stop_id, attribute, reported_at DESC);

CREATE TABLE IF NOT EXISTS public.stop_attributes (
  stop_id    text NOT NULL,
  attribute  text NOT NULL,
  value      text NOT NULL,
  n          integer NOT NULL DEFAULT 0,
  source     text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stop_id, attribute)
);

CREATE INDEX IF NOT EXISTS stop_attributes_stop_idx
  ON public.stop_attributes (stop_id);

-- Curated Nicosia / intercity hubs. Same eight as src/data/stop-amenities.ts.
INSERT INTO public.stop_attributes (stop_id, attribute, value, n, source) VALUES
  ('1009', 'has_shelter', 'yes', 0, 'seed'),
  ('1009', 'has_seating', 'yes', 0, 'seed'),
  ('1009', 'wheelchair_access', 'yes', 0, 'seed'),
  ('1001', 'has_shelter', 'yes', 0, 'seed'),
  ('1001', 'has_seating', 'yes', 0, 'seed'),
  ('1001', 'wheelchair_access', 'yes', 0, 'seed'),
  ('2030', 'has_shelter', 'yes', 0, 'seed'),
  ('2030', 'has_seating', 'yes', 0, 'seed'),
  ('2030', 'wheelchair_access', 'yes', 0, 'seed'),
  ('3050', 'has_shelter', 'yes', 0, 'seed'),
  ('3050', 'has_seating', 'yes', 0, 'seed'),
  ('3050', 'wheelchair_access', 'yes', 0, 'seed'),
  ('2050', 'has_shelter', 'yes', 0, 'seed'),
  ('2050', 'has_seating', 'yes', 0, 'seed'),
  ('2050', 'wheelchair_access', 'yes', 0, 'seed'),
  ('intercity-larnaca-airport', 'has_shelter', 'yes', 0, 'seed'),
  ('intercity-larnaca-airport', 'has_seating', 'yes', 0, 'seed'),
  ('intercity-larnaca-airport', 'wheelchair_access', 'yes', 0, 'seed'),
  ('intercity-paphos', 'has_shelter', 'yes', 0, 'seed'),
  ('intercity-paphos', 'has_seating', 'yes', 0, 'seed'),
  ('intercity-paphos', 'wheelchair_access', 'yes', 0, 'seed'),
  ('intercity-limassol-oldport', 'has_shelter', 'yes', 0, 'seed'),
  ('intercity-limassol-oldport', 'has_seating', 'yes', 0, 'seed'),
  ('intercity-limassol-oldport', 'wheelchair_access', 'yes', 0, 'seed')
ON CONFLICT (stop_id, attribute) DO NOTHING;

GRANT ALL ON public.stop_reports TO service_role;
GRANT ALL ON public.stop_attributes TO service_role;
ALTER TABLE public.stop_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_attributes ENABLE ROW LEVEL SECURITY;

COMMIT;
