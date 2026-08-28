-- D2 — rider "it drove past me". Append-only. Does not rewrite skip
-- visits; the percentage stays a vehicle measurement. Two devices
-- before the stop says it.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_stop_skip_reports.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.stop_skip_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id       text NOT NULL,
  route_id      text,
  device_id     text NOT NULL,
  reported_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stop_skip_reports_stop_idx
  ON public.stop_skip_reports (stop_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS stop_skip_reports_rate_idx
  ON public.stop_skip_reports (device_id, stop_id, reported_at DESC);

GRANT ALL ON public.stop_skip_reports TO service_role;
ALTER TABLE public.stop_skip_reports ENABLE ROW LEVEL SECURITY;

COMMIT;
