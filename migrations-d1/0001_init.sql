-- Aloya D1 schema (translated from supabase/migrations by scripts/d1/gen-d1.py).
-- Fresh database: no data was exported from Supabase project xbidevhyloeetxfjdjiy.

CREATE TABLE IF NOT EXISTS active_trips (
  device_id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  route_short TEXT,
  board_stop_id TEXT,
  board_name TEXT,
  board_unix INTEGER,
  alight_stop_id TEXT,
  alight_name TEXT,
  alight_unix INTEGER,
  walk_in_sec INTEGER NOT NULL DEFAULT 0,
  walk_out_sec INTEGER NOT NULL DEFAULT 0,
  alerts_sent TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  legs TEXT,
  itinerary_id TEXT,
  total_arrival_unix INTEGER
);
CREATE TABLE IF NOT EXISTS arrival_promises (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  user_id TEXT NOT NULL,
  target_arrival_unix INTEGER NOT NULL,
  margin_pref TEXT NOT NULL DEFAULT 'normal',
  origin_label TEXT NOT NULL,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  destination_label TEXT NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '{}',
  ladder_json TEXT NOT NULL DEFAULT '[]',
  leave_by_unix INTEGER NOT NULL,
  baseline_leave_by_unix INTEGER NOT NULL,
  buffer_sec INTEGER NOT NULL DEFAULT 0,
  reason_short TEXT,
  status TEXT NOT NULL DEFAULT 'watching',
  nudges_sent TEXT NOT NULL DEFAULT '[]',
  last_replan_at TEXT,
  replan_count INTEGER NOT NULL DEFAULT 0,
  push_subscription_id TEXT,
  expo_device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS arrival_truth (
  trip_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  actual_arrival TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence TEXT,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (trip_id, stop_id)
);
CREATE TABLE IF NOT EXISTS bedrock_usage (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  access_key_hint TEXT,
  auth_mode TEXT NOT NULL,
  region TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE TABLE IF NOT EXISTS bus_sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  route_id TEXT,
  stop_id TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  device_id TEXT NOT NULL,
  reported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS commute_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  from_h3 TEXT NOT NULL,
  to_h3 TEXT NOT NULL,
  dow_mask INTEGER NOT NULL DEFAULT 0,
  time_bucket INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  from_label TEXT,
  to_label TEXT,
  from_lat REAL,
  from_lng REAL,
  to_lat REAL,
  to_lng REAL,
  UNIQUE (user_id, from_h3, to_h3, time_bucket)
);
CREATE TABLE IF NOT EXISTS delay_stats (
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  mean_delay_sec REAL NOT NULL DEFAULT 0,
  stddev_delay_sec REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (route_id, stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS device_auth (
  device_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS device_reputation (
  device_id TEXT PRIMARY KEY,
  score REAL NOT NULL,
  n INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS dwell_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  mean_dwell_sec REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS dwell_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  mean_dwell_sec REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS email_send_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS email_send_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TEXT,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS eta_accuracy (
  route_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  tier TEXT NOT NULL,
  horizon_bucket TEXT NOT NULL,
  truth_source TEXT NOT NULL,
  model_version_id TEXT NOT NULL DEFAULT '',
  n INTEGER NOT NULL,
  mae_sec INTEGER NOT NULL,
  median_abs_sec INTEGER NOT NULL,
  bias_sec INTEGER NOT NULL,
  mae_pct_of_horizon INTEGER,
  band_hits INTEGER NOT NULL DEFAULT 0,
  band_n INTEGER NOT NULL DEFAULT 0,
  operator_n INTEGER NOT NULL DEFAULT 0,
  operator_mae_sec INTEGER,
  beat_delta_sec INTEGER,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (route_id, hour_of_day, day_of_week, tier, horizon_bucket, truth_source, model_version_id)
);
CREATE TABLE IF NOT EXISTS eta_predictions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  trip_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  horizon_sec INTEGER NOT NULL,
  p50_sec INTEGER NOT NULL,
  p25_sec INTEGER,
  p90_sec INTEGER,
  tier TEXT NOT NULL,
  confidence TEXT NOT NULL,
  operator_eta_sec INTEGER,
  learned_bias_sec INTEGER,
  model_version_id TEXT,
  segment_samples INTEGER,
  dwell_samples INTEGER,
  surface TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS expo_push_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  device_id TEXT NOT NULL UNIQUE,
  expo_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
  app_version TEXT,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS feed_truth_delta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  mean_delta_m REAL NOT NULL DEFAULT 0,
  mean_delta_sec REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS headway_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  scheduled_headway_sec INTEGER NOT NULL DEFAULT 0,
  observed_headway_sec INTEGER NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  bunching_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS job_leases (
  job_name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  pause_reason TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 0,
  params TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS motion_card (
  user_id TEXT PRIMARY KEY,
  card_number TEXT NOT NULL,
  holder TEXT,
  tier TEXT,
  valid_until TEXT,
  card_type TEXT,
  balance_eur REAL NOT NULL DEFAULT 0,
  balance_updated_at TEXT,
  jcc_email TEXT,
  jcc_display_name TEXT,
  jcc_tokens_encrypted TEXT,
  jcc_linked_at TEXT,
  last_sync_at TEXT,
  pass_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS observed_arrivals (
  trip_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  last_predicted_arrival TEXT NOT NULL,
  last_delay_sec INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  passed_at TEXT,
  PRIMARY KEY (trip_id, stop_id)
);
CREATE TABLE IF NOT EXISTS partner_applications (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  org_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  use_case TEXT NOT NULL,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'aloya.cy/partners'
);
CREATE TABLE IF NOT EXISTS pulse_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'island',
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ttl_seconds INTEGER NOT NULL DEFAULT 900,
  UNIQUE (key, scope)
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS rider_vehicle_fixes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  route_id TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  bearing REAL,
  speed_mps REAL,
  accuracy_m REAL,
  device_id TEXT NOT NULL,
  reported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  physics_score REAL
);
CREATE TABLE IF NOT EXISTS route_crowding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  device_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (trip_id, window_start)
);
CREATE TABLE IF NOT EXISTS route_load_estimates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  load_index REAL NOT NULL DEFAULT 0,
  rider_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (trip_id, window_start)
);
CREATE TABLE IF NOT EXISTS rt_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  predicted_arrival TEXT NOT NULL,
  delay_sec INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS saved_places (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('home', 'work', 'custom')),
  label TEXT NOT NULL,
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS scheduled_departures (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  user_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  arrive_by_unix INTEGER NOT NULL,
  remind_at_unix INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  push_subscription_id TEXT,
  last_check_at TEXT,
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS segment_runtimes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  from_stop_id TEXT NOT NULL,
  to_stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  mean_runtime_sec REAL NOT NULL DEFAULT 0,
  stddev_runtime_sec REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, from_stop_id, to_stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS segment_speeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  from_stop_id TEXT NOT NULL,
  to_stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  mean_mps REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, from_stop_id, to_stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS shared_trips (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  token TEXT NOT NULL UNIQUE,
  owner_id TEXT,
  origin_label TEXT,
  destination_label TEXT NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  last_lat REAL,
  last_lng REAL,
  last_updated TEXT,
  eta_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+4 hours'))
);
CREATE TABLE IF NOT EXISTS stop_attributes (
  stop_id TEXT NOT NULL,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (stop_id, attribute)
);
CREATE TABLE IF NOT EXISTS stop_photos (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  stop_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  taken_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS stop_reports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  stop_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  reported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS stop_skip_reports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  stop_id TEXT NOT NULL,
  route_id TEXT,
  device_id TEXT NOT NULL,
  reported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS stop_skip_visits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  stop_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  dwell_sec INTEGER NOT NULL DEFAULT 0,
  classified_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hour_of_day INTEGER,
  day_of_week INTEGER,
  UNIQUE (trip_id, stop_id)
);
CREATE TABLE IF NOT EXISTS training_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at TEXT
);
CREATE TABLE IF NOT EXISTS training_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT,
  stats TEXT NOT NULL DEFAULT '{}',
  ok INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transfer_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_route TEXT NOT NULL,
  to_route TEXT NOT NULL,
  at_stop_id TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  planned_wait_sec INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (from_route, to_route, at_stop_id, hour_of_day, day_of_week)
);
CREATE TABLE IF NOT EXISTS trip_group_members (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  group_id TEXT NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  member_token TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  origin_label TEXT,
  last_lat REAL,
  last_lng REAL,
  last_updated TEXT,
  eta_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  is_creator INTEGER NOT NULL DEFAULT 0,
  owner_id TEXT,
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS trip_groups (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  code TEXT NOT NULL UNIQUE,
  destination_label TEXT NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  created_by_name TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+8 hours'))
);
CREATE TABLE IF NOT EXISTS trip_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  device_id TEXT NOT NULL,
  from_lat REAL NOT NULL,
  from_lng REAL NOT NULL,
  from_label TEXT NOT NULL,
  to_lat REAL NOT NULL,
  to_lng REAL NOT NULL,
  to_label TEXT NOT NULL,
  route_short TEXT,
  source TEXT NOT NULL DEFAULT 'completed',
  dow INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id TEXT
);
CREATE TABLE IF NOT EXISTS trip_no_shows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  trip_id TEXT NOT NULL,
  service_date TEXT NOT NULL,
  detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  hour_of_day INTEGER,
  day_of_week INTEGER,
  UNIQUE (trip_id, service_date)
);
CREATE TABLE IF NOT EXISTS trip_overrides (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  device_id TEXT NOT NULL,
  from_lat REAL NOT NULL,
  from_lng REAL NOT NULL,
  to_lat REAL NOT NULL,
  to_lng REAL NOT NULL,
  planned_legs TEXT NOT NULL,
  actual_legs TEXT,
  kind TEXT NOT NULL,
  hour INTEGER NOT NULL,
  dow INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS trip_plan_shares (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  token TEXT NOT NULL UNIQUE,
  owner_id TEXT,
  creator_name TEXT,
  origin_label TEXT NOT NULL,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  destination_label TEXT NOT NULL,
  destination_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  departure_unix INTEGER NOT NULL,
  arrival_unix INTEGER NOT NULL,
  total_duration_sec INTEGER NOT NULL,
  transfers INTEGER NOT NULL DEFAULT 0,
  legs TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'))
);
CREATE TABLE IF NOT EXISTS user_passkeys (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT NOT NULL DEFAULT 'Passkey',
  transports TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  locale TEXT NOT NULL DEFAULT 'en',
  notif_trip_alerts INTEGER NOT NULL DEFAULT 1,
  notif_disruptions INTEGER NOT NULL DEFAULT 1,
  onboarded_at TEXT,
  consent_analytics INTEGER NOT NULL DEFAULT 0,
  consent_cookies_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accessibility_prefs TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS vehicle_pings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  trip_id TEXT NOT NULL,
  route_id TEXT NOT NULL DEFAULT '',
  vehicle_id TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  bearing REAL,
  speed_mps REAL,
  source TEXT NOT NULL DEFAULT 'feed'
);
CREATE TABLE IF NOT EXISTS walk_links (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  from_stop_id TEXT NOT NULL,
  to_stop_id TEXT NOT NULL,
  distance_m INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL,
  polyline TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (from_stop_id <= to_stop_id),
  UNIQUE (from_stop_id, to_stop_id)
);
CREATE TABLE IF NOT EXISTS walk_pace_stats (
  device_id TEXT PRIMARY KEY,
  mean_mps REAL NOT NULL DEFAULT 1.3,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS weather_delay_coupling (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id TEXT NOT NULL,
  condition TEXT NOT NULL,
  hour_of_day INTEGER NOT NULL,
  mean_extra_delay_sec REAL NOT NULL DEFAULT 0,
  sample_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (route_id, condition, hour_of_day)
);
CREATE INDEX IF NOT EXISTS idx_rt_snapshots_route_stop_time ON rt_snapshots (route_id, stop_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_rt_snapshots_trip ON rt_snapshots (trip_id, stop_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_observed_arrivals_stop ON observed_arrivals (stop_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device ON push_subscriptions (device_id);
CREATE INDEX IF NOT EXISTS idx_active_trips_updated_at ON active_trips (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_trips_alight_unix ON active_trips (alight_unix);
CREATE INDEX IF NOT EXISTS trip_history_device_recorded_idx ON trip_history (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_walk_links_from ON walk_links (from_stop_id);
CREATE INDEX IF NOT EXISTS idx_walk_links_to ON walk_links (to_stop_id);
CREATE INDEX IF NOT EXISTS idx_trip_overrides_recorded ON trip_overrides (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_fixes_trip_recent ON rider_vehicle_fixes (trip_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_fixes_reported ON rider_vehicle_fixes (reported_at DESC);
CREATE INDEX IF NOT EXISTS training_events_kind_recorded_idx ON training_events (kind, recorded_at);
CREATE INDEX IF NOT EXISTS training_events_unprocessed_idx ON training_events (processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS rider_vehicle_fixes_trip_time_idx ON rider_vehicle_fixes (trip_id, reported_at);
CREATE INDEX IF NOT EXISTS route_crowding_route_window_idx ON route_crowding (route_id, window_start);
CREATE INDEX IF NOT EXISTS scheduled_departures_remind_idx ON scheduled_departures (status, remind_at_unix);
CREATE INDEX IF NOT EXISTS scheduled_departures_user_idx ON scheduled_departures (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_history_user_id ON trip_history (user_id);
CREATE INDEX IF NOT EXISTS idx_trip_history_device_id ON trip_history (device_id);
CREATE INDEX IF NOT EXISTS saved_places_user_idx ON saved_places (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS saved_places_user_kind_unique ON saved_places (user_id, kind) WHERE kind IN ('home','work');
CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON email_send_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON email_send_log (recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON email_send_log (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique ON email_send_log (message_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_pulse_signals_key_scope ON pulse_signals (key, scope);
CREATE INDEX IF NOT EXISTS idx_pulse_signals_fetched_at ON pulse_signals (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_rt_snapshots_captured_at ON rt_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS bus_sightings_trip_recent_idx ON bus_sightings (trip_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS bus_sightings_device_trip_idx ON bus_sightings (device_id, trip_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS expo_push_tokens_token_idx ON expo_push_tokens (expo_token);
CREATE INDEX IF NOT EXISTS shared_trips_token_idx ON shared_trips (token);
CREATE INDEX IF NOT EXISTS shared_trips_owner_idx ON shared_trips (owner_id);
CREATE INDEX IF NOT EXISTS trip_groups_code_idx ON trip_groups (code);
CREATE INDEX IF NOT EXISTS trip_group_members_group_idx ON trip_group_members (group_id);
CREATE INDEX IF NOT EXISTS trip_plan_shares_token_idx ON trip_plan_shares (token);
CREATE INDEX IF NOT EXISTS trip_plan_shares_owner_idx ON trip_plan_shares (owner_id);
CREATE INDEX IF NOT EXISTS bedrock_usage_created_at_idx ON bedrock_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS bedrock_usage_key_hint_idx ON bedrock_usage (access_key_hint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys (user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON user_passkeys (credential_id);
CREATE INDEX IF NOT EXISTS eta_predictions_trip_stop_idx ON eta_predictions (trip_id, stop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eta_predictions_created_idx ON eta_predictions (created_at);
CREATE INDEX IF NOT EXISTS eta_predictions_hour_idx ON eta_predictions (hour_of_day, day_of_week, route_id);
CREATE INDEX IF NOT EXISTS arrival_truth_route_hour_idx ON arrival_truth (route_id, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS arrival_truth_created_idx ON arrival_truth (created_at);
CREATE INDEX IF NOT EXISTS partner_applications_email_idx ON partner_applications (email COLLATE NOCASE, created_at DESC);
CREATE INDEX IF NOT EXISTS eta_accuracy_route_idx ON eta_accuracy (route_id, truth_source, n DESC);
CREATE INDEX IF NOT EXISTS eta_accuracy_computed_idx ON eta_accuracy (computed_at);
CREATE INDEX IF NOT EXISTS vehicle_pings_trip_time_idx ON vehicle_pings (trip_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_pings_captured_idx ON vehicle_pings (captured_at);
CREATE INDEX IF NOT EXISTS trip_no_shows_route_hour_idx ON trip_no_shows (route_id, hour_of_day, day_of_week, service_date);
CREATE INDEX IF NOT EXISTS stop_reports_lookup_idx ON stop_reports (stop_id, attribute, reported_at DESC);
CREATE INDEX IF NOT EXISTS stop_reports_rate_idx ON stop_reports (device_id, stop_id, attribute, reported_at DESC);
CREATE INDEX IF NOT EXISTS stop_attributes_stop_idx ON stop_attributes (stop_id);
CREATE INDEX IF NOT EXISTS stop_photos_stop_idx ON stop_photos (stop_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS stop_photos_rate_idx ON stop_photos (device_id, stop_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS stop_skip_visits_stop_idx ON stop_skip_visits (stop_id, route_id, classified_at DESC);
CREATE INDEX IF NOT EXISTS stop_skip_reports_stop_idx ON stop_skip_reports (stop_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS stop_skip_reports_rate_idx ON stop_skip_reports (device_id, stop_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS device_reputation_updated_idx ON device_reputation (updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rt_snapshots_trip_stop_unique ON rt_snapshots (trip_id, stop_id);
CREATE INDEX IF NOT EXISTS rt_snapshots_captured_at_idx ON rt_snapshots (captured_at);
CREATE INDEX IF NOT EXISTS observed_arrivals_last_seen_idx ON observed_arrivals (last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS delay_stats_key_idx ON delay_stats (route_id, stop_id, hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS arrival_promises_watch_idx ON arrival_promises (status, leave_by_unix);
CREATE INDEX IF NOT EXISTS arrival_promises_user_idx ON arrival_promises (user_id, target_arrival_unix DESC);

-- ---------------------------------------------------------------------------
-- Replacements for Supabase-managed objects (auth schema, pgmq, vault).
-- ---------------------------------------------------------------------------

-- Own auth: one row per rider. Anonymous device users have email NULL.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE COLLATE NOCASE,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  email_confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_sign_in_at TEXT
);

-- Email one-time codes (hashed). One live code per email; `user_id` is set
-- when the code links an email to an existing anonymous user.
CREATE TABLE IF NOT EXISTS auth_otp_codes (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  user_id TEXT,
  purpose TEXT NOT NULL DEFAULT 'signin',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- WebAuthn registration/authentication challenges (short-lived).
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- pgmq replacement for the email queues (auth_emails, transactional_emails, *_dlq).
CREATE TABLE IF NOT EXISTS email_queue (
  msg_id INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_name TEXT NOT NULL,
  message TEXT NOT NULL,
  read_ct INTEGER NOT NULL DEFAULT 0,
  vt INTEGER NOT NULL DEFAULT 0,
  enqueued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS email_queue_ready_idx ON email_queue (queue_name, vt, msg_id);

-- Delivery ledger written by notify.server.ts (had no Supabase migration).
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,
  tag TEXT,
  title TEXT,
  body TEXT,
  url TEXT,
  device_id TEXT,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  pruned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS notification_deliveries_created_idx ON notification_deliveries (created_at);

-- Names the code reads that never had their own table in Supabase.
CREATE VIEW IF NOT EXISTS stop_conditions AS
  SELECT stop_id, attribute, value, n, source, updated_at FROM stop_attributes;
CREATE VIEW IF NOT EXISTS user_profiles AS
  SELECT id, email FROM users WHERE email IS NOT NULL;

-- Singleton row the email queue processor expects.
INSERT OR IGNORE INTO email_send_state (id) VALUES (1);

