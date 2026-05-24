-- Training pipeline tables for the learning loop.

CREATE TABLE IF NOT EXISTS public.segment_runtimes (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  from_stop_id TEXT NOT NULL,
  to_stop_id TEXT NOT NULL,
  hour_of_day SMALLINT NOT NULL,
  day_of_week SMALLINT NOT NULL,
  mean_runtime_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  stddev_runtime_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, from_stop_id, to_stop_id, hour_of_day, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.dwell_stats (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day SMALLINT NOT NULL,
  day_of_week SMALLINT NOT NULL,
  mean_dwell_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, stop_id, hour_of_day, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.headway_observations (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day SMALLINT NOT NULL,
  day_of_week SMALLINT NOT NULL,
  scheduled_headway_sec INTEGER NOT NULL DEFAULT 0,
  observed_headway_sec INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  bunching_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, stop_id, hour_of_day, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.feed_truth_delta (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  hour_of_day SMALLINT NOT NULL,
  day_of_week SMALLINT NOT NULL,
  mean_delta_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  mean_delta_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, hour_of_day, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.walk_pace_stats (
  device_id TEXT PRIMARY KEY,
  mean_mps DOUBLE PRECISION NOT NULL DEFAULT 1.3,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transfer_outcomes (
  id BIGSERIAL PRIMARY KEY,
  from_route TEXT NOT NULL,
  to_route TEXT NOT NULL,
  at_stop_id TEXT NOT NULL,
  hour_of_day SMALLINT NOT NULL,
  day_of_week SMALLINT NOT NULL,
  planned_wait_sec INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_route, to_route, at_stop_id, hour_of_day, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.trip_no_shows (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  service_date DATE NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, service_date)
);

CREATE TABLE IF NOT EXISTS public.route_crowding (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (trip_id, window_start)
);

CREATE TABLE IF NOT EXISTS public.weather_delay_coupling (
  id BIGSERIAL PRIMARY KEY,
  route_id TEXT NOT NULL,
  condition TEXT NOT NULL, -- 'clear' | 'rain' | 'wind' | 'heat'
  hour_of_day SMALLINT NOT NULL,
  mean_extra_delay_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, condition, hour_of_day)
);

CREATE TABLE IF NOT EXISTS public.model_versions (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.training_events (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'walk-complete' | 'transfer-made' | 'transfer-missed' | 'no-show-reported'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.training_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  ok BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS training_events_kind_recorded_idx
  ON public.training_events (kind, recorded_at);
CREATE INDEX IF NOT EXISTS training_events_unprocessed_idx
  ON public.training_events (processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS rider_vehicle_fixes_trip_time_idx
  ON public.rider_vehicle_fixes (trip_id, reported_at);
CREATE INDEX IF NOT EXISTS route_crowding_route_window_idx
  ON public.route_crowding (route_id, window_start);

-- RLS: tables locked by default; rollups public-read.
ALTER TABLE public.segment_runtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dwell_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headway_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_truth_delta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walk_pace_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_no_shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_crowding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_delay_coupling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read segment_runtimes" ON public.segment_runtimes FOR SELECT TO public USING (true);
CREATE POLICY "Public can read dwell_stats" ON public.dwell_stats FOR SELECT TO public USING (true);
CREATE POLICY "Public can read headway_observations" ON public.headway_observations FOR SELECT TO public USING (true);
CREATE POLICY "Public can read feed_truth_delta" ON public.feed_truth_delta FOR SELECT TO public USING (true);
CREATE POLICY "Public can read transfer_outcomes" ON public.transfer_outcomes FOR SELECT TO public USING (true);
CREATE POLICY "Public can read trip_no_shows" ON public.trip_no_shows FOR SELECT TO public USING (true);
CREATE POLICY "Public can read route_crowding" ON public.route_crowding FOR SELECT TO public USING (true);
CREATE POLICY "Public can read weather_delay_coupling" ON public.weather_delay_coupling FOR SELECT TO public USING (true);
CREATE POLICY "Public can read model_versions" ON public.model_versions FOR SELECT TO public USING (true);

-- walk_pace_stats / training_events / training_runs: server-only (no public policies).

-- Seed the active model row.
INSERT INTO public.model_versions (name, is_active, params)
VALUES ('baseline-v1', true, '{"liveWeight":0.7,"transferDemoteAfter":3,"walkPaceDefault":1.3}'::jsonb)
ON CONFLICT (name) DO NOTHING;