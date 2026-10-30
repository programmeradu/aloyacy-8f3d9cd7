-- Cut D1 rows read (account-wide free limit is 5M/day).
--
-- resolve-arrivals runs about every 90s and asks for unresolved arrivals
-- whose predicted time fell in the last 45 minutes. With no index on
-- last_predicted_arrival it scanned the table (~24k rows) on each run,
-- about 5.6M rows read per day on its own. A partial index over the
-- unresolved rows turns that into a range read of the few dozen rows in
-- the window. The query's literal `passed_at IS NULL` lets SQLite use it.
CREATE INDEX IF NOT EXISTS observed_arrivals_open_predicted_idx
  ON observed_arrivals (last_predicted_arrival)
  WHERE passed_at IS NULL;

-- delay_stats' primary key starts with route_id, so lookups by stop_id
-- (with or without hour/day) scanned the table: ~0.6M rows read per day.
CREATE INDEX IF NOT EXISTS delay_stats_stop_hour_dow_idx
  ON delay_stats (stop_id, hour_of_day, day_of_week);
