
-- 1) segment_speeds
CREATE TABLE public.segment_speeds (
  id bigserial PRIMARY KEY,
  route_id text NOT NULL,
  from_stop_id text NOT NULL,
  to_stop_id text NOT NULL,
  hour_of_day smallint NOT NULL,
  day_of_week smallint NOT NULL,
  mean_mps double precision NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, from_stop_id, to_stop_id, hour_of_day, day_of_week)
);
GRANT SELECT ON public.segment_speeds TO anon, authenticated;
GRANT ALL ON public.segment_speeds TO service_role;
ALTER TABLE public.segment_speeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read segment_speeds" ON public.segment_speeds FOR SELECT USING (true);

-- 2) dwell_observations
CREATE TABLE public.dwell_observations (
  id bigserial PRIMARY KEY,
  route_id text NOT NULL,
  stop_id text NOT NULL,
  hour_of_day smallint NOT NULL,
  day_of_week smallint NOT NULL,
  mean_dwell_sec double precision NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, stop_id, hour_of_day, day_of_week)
);
GRANT SELECT ON public.dwell_observations TO anon, authenticated;
GRANT ALL ON public.dwell_observations TO service_role;
ALTER TABLE public.dwell_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read dwell_observations" ON public.dwell_observations FOR SELECT USING (true);

-- 3) commute_patterns (per-user)
CREATE TABLE public.commute_patterns (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  from_h3 text NOT NULL,
  to_h3 text NOT NULL,
  dow_mask integer NOT NULL DEFAULT 0,
  time_bucket smallint NOT NULL,
  count integer NOT NULL DEFAULT 1,
  last_seen timestamptz NOT NULL DEFAULT now(),
  from_label text,
  to_label text,
  from_lat double precision,
  from_lng double precision,
  to_lat double precision,
  to_lng double precision,
  UNIQUE (user_id, from_h3, to_h3, time_bucket)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commute_patterns TO authenticated;
GRANT ALL ON public.commute_patterns TO service_role;
ALTER TABLE public.commute_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own commute" ON public.commute_patterns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users write own commute" ON public.commute_patterns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own commute" ON public.commute_patterns FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own commute" ON public.commute_patterns FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 4) route_load_estimates (public read; written by edge logic via service_role)
CREATE TABLE public.route_load_estimates (
  id bigserial PRIMARY KEY,
  trip_id text NOT NULL,
  route_id text NOT NULL,
  window_start timestamptz NOT NULL,
  load_index double precision NOT NULL DEFAULT 0,
  rider_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, window_start)
);
GRANT SELECT ON public.route_load_estimates TO anon, authenticated;
GRANT ALL ON public.route_load_estimates TO service_role;
ALTER TABLE public.route_load_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read load" ON public.route_load_estimates FOR SELECT USING (true);

-- 5) scheduled_departures (per-user reminders)
CREATE TABLE public.scheduled_departures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_json jsonb NOT NULL,
  arrive_by_unix bigint NOT NULL,
  remind_at_unix bigint NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  push_subscription_id uuid,
  last_check_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scheduled_departures_remind_idx ON public.scheduled_departures (status, remind_at_unix);
CREATE INDEX scheduled_departures_user_idx ON public.scheduled_departures (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_departures TO authenticated;
GRANT ALL ON public.scheduled_departures TO service_role;
ALTER TABLE public.scheduled_departures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own deps" ON public.scheduled_departures FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own deps" ON public.scheduled_departures FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own deps" ON public.scheduled_departures FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own deps" ON public.scheduled_departures FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER scheduled_departures_updated_at
BEFORE UPDATE ON public.scheduled_departures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER commute_patterns_updated_at
BEFORE UPDATE ON public.commute_patterns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
