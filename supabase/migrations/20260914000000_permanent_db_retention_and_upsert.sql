-- Aloya — Permanent DB retention and bounded upsert (2026-09-14)
--
-- Root cause: append-only inserts into rt_snapshots and vehicle_pings caused
-- table and index bloat that exceeded Supabase's 500MB free quota.
-- In Postgres, DELETE does NOT reclaim disk space without VACUUM FULL.
--
-- Solution:
--   1. rt_snapshots is converted to an UPSERT on (trip_id, stop_id).
--      Active transit in Cyprus only has ~200 buses (~5,000 active predictions).
--      The working table size stays bounded to ~2-4 MB forever.
--   2. All durable raw historical snapshots and vehicle pings already stream
--      directly to the Cloudflare R2 data lake (streamToLake in lake.server.ts).
--   3. Inline retention purges finished trips (> 2h) and stale pings (> 6h).

-- 1. Deduplicate rt_snapshots and enforce uniqueness on (trip_id, stop_id)
DELETE FROM public.rt_snapshots a
USING public.rt_snapshots b
WHERE a.trip_id = b.trip_id
  AND a.stop_id = b.stop_id
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS rt_snapshots_trip_stop_unique
  ON public.rt_snapshots (trip_id, stop_id);

CREATE INDEX IF NOT EXISTS rt_snapshots_captured_at_idx
  ON public.rt_snapshots (captured_at);

CREATE INDEX IF NOT EXISTS observed_arrivals_last_seen_idx
  ON public.observed_arrivals (last_seen_at);

CREATE UNIQUE INDEX IF NOT EXISTS delay_stats_key_idx
  ON public.delay_stats (route_id, stop_id, hour_of_day, day_of_week);

-- 2. Update ingest_gtfs_snapshots_v2 with bounded upsert and retention
CREATE OR REPLACE FUNCTION public.ingest_gtfs_snapshots_v2(
  snapshots jsonb,
  observed jsonb,
  stats jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bounded upsert into rt_snapshots on (trip_id, stop_id)
  IF jsonb_array_length(coalesce(snapshots, '[]'::jsonb)) > 0 THEN
    INSERT INTO rt_snapshots (route_id, stop_id, trip_id, predicted_arrival, delay_sec, captured_at)
    SELECT
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'trip_id')::text,
      (value->>'predicted_arrival')::timestamptz,
      (value->>'delay_sec')::integer,
      coalesce((value->>'captured_at')::timestamptz, now())
    FROM jsonb_array_elements(snapshots)
    ON CONFLICT (trip_id, stop_id) DO UPDATE SET
      route_id          = excluded.route_id,
      predicted_arrival = excluded.predicted_arrival,
      delay_sec         = excluded.delay_sec,
      captured_at       = excluded.captured_at;
  END IF;

  -- Upsert into observed_arrivals
  IF jsonb_array_length(coalesce(observed, '[]'::jsonb)) > 0 THEN
    INSERT INTO observed_arrivals (trip_id, stop_id, route_id, last_predicted_arrival, last_delay_sec, last_seen_at)
    SELECT
      (value->>'trip_id')::text,
      (value->>'stop_id')::text,
      (value->>'route_id')::text,
      (value->>'last_predicted_arrival')::timestamptz,
      (value->>'last_delay_sec')::integer,
      (value->>'last_seen_at')::timestamptz
    FROM jsonb_array_elements(observed)
    ON CONFLICT (trip_id, stop_id) DO UPDATE SET
      last_predicted_arrival = excluded.last_predicted_arrival,
      last_delay_sec        = excluded.last_delay_sec,
      last_seen_at          = excluded.last_seen_at;
  END IF;

  -- Incremental weighted mean upsert into delay_stats
  IF jsonb_array_length(coalesce(stats, '[]'::jsonb)) > 0 THEN
    INSERT INTO delay_stats AS d
      (route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count, updated_at)
    SELECT
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'hour_of_day')::integer,
      (value->>'day_of_week')::integer,
      (value->>'sum_delay_sec')::double precision
        / greatest((value->>'count')::integer, 1),
      (value->>'count')::integer,
      now()
    FROM jsonb_array_elements(stats)
    ON CONFLICT (route_id, stop_id, hour_of_day, day_of_week) DO UPDATE SET
      mean_delay_sec =
        ((d.mean_delay_sec * d.sample_count)
          + (excluded.mean_delay_sec * excluded.sample_count))
        / greatest(d.sample_count + excluded.sample_count, 1),
      sample_count = least(d.sample_count + excluded.sample_count, 100000),
      updated_at   = now();
  END IF;

  -- Inline Automatic Retention:
  -- Purge finished trips from rt_snapshots older than 2 hours
  DELETE FROM rt_snapshots WHERE captured_at < now() - interval '2 hours';

  -- Purge stale vehicle pings older than 6 hours
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicle_pings') THEN
    DELETE FROM vehicle_pings WHERE captured_at < now() - interval '6 hours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_gtfs_snapshots_v2(jsonb, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.ingest_gtfs_snapshots_v2(jsonb, jsonb, jsonb) TO anon, authenticated, service_role;

-- 3. Also update legacy ingest_gtfs_snapshots fallback to use the same bounded upsert
CREATE OR REPLACE FUNCTION public.ingest_gtfs_snapshots(
  snapshots jsonb,
  observed jsonb,
  stats jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF jsonb_array_length(coalesce(snapshots, '[]'::jsonb)) > 0 THEN
    INSERT INTO rt_snapshots (route_id, stop_id, trip_id, predicted_arrival, delay_sec, captured_at)
    SELECT
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'trip_id')::text,
      (value->>'predicted_arrival')::timestamptz,
      (value->>'delay_sec')::integer,
      coalesce((value->>'captured_at')::timestamptz, now())
    FROM jsonb_array_elements(snapshots)
    ON CONFLICT (trip_id, stop_id) DO UPDATE SET
      route_id          = excluded.route_id,
      predicted_arrival = excluded.predicted_arrival,
      delay_sec         = excluded.delay_sec,
      captured_at       = excluded.captured_at;
  END IF;

  IF jsonb_array_length(coalesce(observed, '[]'::jsonb)) > 0 THEN
    INSERT INTO observed_arrivals (trip_id, stop_id, route_id, last_predicted_arrival, last_delay_sec, last_seen_at)
    SELECT
      (value->>'trip_id')::text,
      (value->>'stop_id')::text,
      (value->>'route_id')::text,
      (value->>'last_predicted_arrival')::timestamptz,
      (value->>'last_delay_sec')::integer,
      (value->>'last_seen_at')::timestamptz
    FROM jsonb_array_elements(observed)
    ON CONFLICT (trip_id, stop_id) DO UPDATE SET
      last_predicted_arrival = excluded.last_predicted_arrival,
      last_delay_sec = excluded.last_delay_sec,
      last_seen_at = excluded.last_seen_at;
  END IF;

  IF jsonb_array_length(coalesce(stats, '[]'::jsonb)) > 0 THEN
    INSERT INTO delay_stats (route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count, updated_at)
    SELECT
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'hour_of_day')::integer,
      (value->>'day_of_week')::integer,
      (value->>'mean_delay_sec')::double precision,
      (value->>'sample_count')::integer,
      (value->>'updated_at')::timestamptz
    FROM jsonb_array_elements(stats)
    ON CONFLICT (route_id, stop_id, hour_of_day, day_of_week) DO UPDATE SET
      mean_delay_sec = excluded.mean_delay_sec,
      sample_count = excluded.sample_count,
      updated_at = excluded.updated_at;
  END IF;

  DELETE FROM rt_snapshots WHERE captured_at < now() - interval '2 hours';
  DELETE FROM observed_arrivals WHERE last_seen_at < now() - interval '2 days';
  DELETE FROM rider_vehicle_fixes WHERE reported_at < now() - interval '2 days';
  DELETE FROM bus_sightings WHERE reported_at < now() - interval '2 days';

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicle_pings') THEN
    DELETE FROM vehicle_pings WHERE captured_at < now() - interval '6 hours';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_gtfs_snapshots(jsonb, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.ingest_gtfs_snapshots(jsonb, jsonb, jsonb) TO anon, authenticated, service_role;

-- 4. Maintenance / prune RPC
CREATE OR REPLACE FUNCTION public.prune_transit_history(days integer default 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer := 0;
BEGIN
  DELETE FROM rt_snapshots WHERE captured_at < now() - interval '2 hours';
  GET DIAGNOSTICS removed = row_count;

  DELETE FROM observed_arrivals WHERE last_seen_at < now() - interval '2 days';

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'vehicle_pings') THEN
    DELETE FROM vehicle_pings WHERE captured_at < now() - interval '6 hours';
  END IF;

  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_transit_history(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.prune_transit_history(integer) TO anon, authenticated, service_role;
