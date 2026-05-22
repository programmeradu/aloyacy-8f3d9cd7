
-- Raw snapshots from the live GTFS-RT feed
CREATE TABLE public.rt_snapshots (
  id BIGSERIAL PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  predicted_arrival TIMESTAMPTZ NOT NULL,
  delay_sec INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_rt_snapshots_route_stop_time
  ON public.rt_snapshots (route_id, stop_id, captured_at DESC);
CREATE INDEX idx_rt_snapshots_trip
  ON public.rt_snapshots (trip_id, stop_id, captured_at DESC);

-- Learned distribution of delay per route/stop/hour/weekday
CREATE TABLE public.delay_stats (
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day SMALLINT NOT NULL,
  day_of_week SMALLINT NOT NULL,
  mean_delay_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  stddev_delay_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (route_id, stop_id, hour_of_day, day_of_week)
);

-- Last observed prediction per trip+stop (for "did it pass?" detection)
CREATE TABLE public.observed_arrivals (
  trip_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  last_predicted_arrival TIMESTAMPTZ NOT NULL,
  last_delay_sec INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  passed_at TIMESTAMPTZ,
  PRIMARY KEY (trip_id, stop_id)
);

CREATE INDEX idx_observed_arrivals_stop
  ON public.observed_arrivals (stop_id, last_seen_at DESC);

-- RLS — transit data is non-personal; public read, server-only write
ALTER TABLE public.rt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delay_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observed_arrivals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read snapshots"
  ON public.rt_snapshots FOR SELECT USING (true);
CREATE POLICY "Public can read delay stats"
  ON public.delay_stats FOR SELECT USING (true);
CREATE POLICY "Public can read observed arrivals"
  ON public.observed_arrivals FOR SELECT USING (true);
