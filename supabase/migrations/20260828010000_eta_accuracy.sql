-- A3 scored predictions. Mirror of deploy/supabase/sql/20260828_eta_accuracy.sql.

CREATE TABLE IF NOT EXISTS public.eta_accuracy (
  route_id            text NOT NULL,
  hour_of_day         smallint NOT NULL,
  day_of_week         smallint NOT NULL,
  tier                text NOT NULL,
  horizon_bucket      text NOT NULL,
  truth_source        text NOT NULL,
  model_version_id    text NOT NULL DEFAULT '',
  n                   integer NOT NULL,
  mae_sec             integer NOT NULL,
  median_abs_sec      integer NOT NULL,
  bias_sec            integer NOT NULL,
  mae_pct_of_horizon  integer,
  band_hits           integer NOT NULL DEFAULT 0,
  band_n              integer NOT NULL DEFAULT 0,
  operator_n          integer NOT NULL DEFAULT 0,
  operator_mae_sec    integer,
  beat_delta_sec      integer,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    route_id, hour_of_day, day_of_week, tier,
    horizon_bucket, truth_source, model_version_id
  )
);

CREATE INDEX IF NOT EXISTS eta_accuracy_route_idx
  ON public.eta_accuracy (route_id, truth_source, n DESC);
CREATE INDEX IF NOT EXISTS eta_accuracy_computed_idx
  ON public.eta_accuracy (computed_at);

GRANT ALL ON public.eta_accuracy TO service_role;
ALTER TABLE public.eta_accuracy ENABLE ROW LEVEL SECURITY;
