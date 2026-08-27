-- Truth ledger — prediction rows we rendered, and the actual arrivals we
-- later resolved. Without these tables there is nothing to score and nothing
-- to sell as Truth. Hour/dow are Asia/Nicosia, stamped by the writer.
--
-- Apply against the self-hosted stack:
--   psql "$TARGET_DB_URL" -f deploy/supabase/sql/20260828_truth_ledger.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.eta_predictions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  trip_id             text NOT NULL,
  route_id            text NOT NULL,
  stop_id             text NOT NULL,
  horizon_sec         integer NOT NULL,
  p50_sec             integer NOT NULL,
  p25_sec             integer,
  p90_sec             integer,
  tier                text NOT NULL,
  confidence          text NOT NULL,
  operator_eta_sec    integer,
  learned_bias_sec    integer,
  model_version_id    uuid,
  segment_samples     integer,
  dwell_samples       integer,
  surface             text NOT NULL,
  hour_of_day         smallint NOT NULL,
  day_of_week         smallint NOT NULL
);

CREATE INDEX IF NOT EXISTS eta_predictions_trip_stop_idx
  ON public.eta_predictions (trip_id, stop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eta_predictions_created_idx
  ON public.eta_predictions (created_at);
CREATE INDEX IF NOT EXISTS eta_predictions_hour_idx
  ON public.eta_predictions (hour_of_day, day_of_week, route_id);

GRANT ALL ON public.eta_predictions TO service_role;
ALTER TABLE public.eta_predictions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.arrival_truth (
  trip_id             text NOT NULL,
  stop_id             text NOT NULL,
  route_id            text NOT NULL,
  actual_arrival      timestamptz NOT NULL,
  source              text NOT NULL,
  evidence            jsonb,
  hour_of_day         smallint NOT NULL,
  day_of_week         smallint NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, stop_id)
);

CREATE INDEX IF NOT EXISTS arrival_truth_route_hour_idx
  ON public.arrival_truth (route_id, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS arrival_truth_created_idx
  ON public.arrival_truth (created_at);

GRANT ALL ON public.arrival_truth TO service_role;
ALTER TABLE public.arrival_truth ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.partner_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  org_name        text NOT NULL,
  contact_name    text NOT NULL,
  email           text NOT NULL,
  role            text NOT NULL,
  use_case        text NOT NULL,
  website         text,
  status          text NOT NULL DEFAULT 'new',
  source          text NOT NULL DEFAULT 'aloya.cy/partners'
);

CREATE INDEX IF NOT EXISTS partner_applications_email_idx
  ON public.partner_applications (lower(email), created_at DESC);

GRANT ALL ON public.partner_applications TO service_role;
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

COMMIT;
