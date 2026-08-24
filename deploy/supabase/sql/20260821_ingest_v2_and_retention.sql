-- Aloya — ingest performance + retention rescue (2026-08-21)
--
-- Symptom this fixes: every learning/pulse feed went stale because
-- /api/public/snapshot could no longer finish. The old ingest read
-- delay_stats back with a 50-way `or(and(...))` filter per chunk; on the
-- migrated database each of those reads took ~40s and a plain count(*) on
-- delay_stats hit the statement timeout, so the cron job never completed
-- and nothing was written at all.
--
-- Three parts:
--   1. indexes + retention so the hot tables stop growing without bound
--   2. ingest_gtfs_snapshots_v2 — merges the running mean in SQL, so the
--      app never has to read delay_stats back
--   3. one-off cleanup + VACUUM guidance at the bottom
--
-- Run this once against the app database (SQL editor or psql).

-- ---------------------------------------------------------------- 1. indexes

create index if not exists rt_snapshots_captured_at_idx
  on public.rt_snapshots (captured_at);

create index if not exists observed_arrivals_last_seen_idx
  on public.observed_arrivals (last_seen_at);

-- The upsert target for delay_stats. Should already exist as a unique
-- constraint; this is a no-op when it does.
create unique index if not exists delay_stats_key_idx
  on public.delay_stats (route_id, stop_id, hour_of_day, day_of_week);

-- ------------------------------------------------------------- 2. ingest v2

-- `stats` entries carry a DELTA, not an absolute:
--   { route_id, stop_id, hour_of_day, day_of_week, sum_delay_sec, count }
-- The weighted mean is recomputed inside Postgres against the current row,
-- which removes the read-modify-write round trip entirely.
create or replace function public.ingest_gtfs_snapshots_v2(
  snapshots jsonb,
  observed jsonb,
  stats jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_array_length(coalesce(snapshots, '[]'::jsonb)) > 0 then
    insert into rt_snapshots (route_id, stop_id, trip_id, predicted_arrival, delay_sec)
    select
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'trip_id')::text,
      (value->>'predicted_arrival')::timestamptz,
      (value->>'delay_sec')::integer
    from jsonb_array_elements(snapshots);
  end if;

  if jsonb_array_length(coalesce(observed, '[]'::jsonb)) > 0 then
    insert into observed_arrivals (trip_id, stop_id, route_id, last_predicted_arrival, last_delay_sec, last_seen_at)
    select
      (value->>'trip_id')::text,
      (value->>'stop_id')::text,
      (value->>'route_id')::text,
      (value->>'last_predicted_arrival')::timestamptz,
      (value->>'last_delay_sec')::integer,
      (value->>'last_seen_at')::timestamptz
    from jsonb_array_elements(observed)
    on conflict (trip_id, stop_id) do update set
      last_predicted_arrival = excluded.last_predicted_arrival,
      last_delay_sec        = excluded.last_delay_sec,
      last_seen_at          = excluded.last_seen_at;
  end if;

  if jsonb_array_length(coalesce(stats, '[]'::jsonb)) > 0 then
    insert into delay_stats as d
      (route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count, updated_at)
    select
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'hour_of_day')::integer,
      (value->>'day_of_week')::integer,
      (value->>'sum_delay_sec')::double precision
        / greatest((value->>'count')::integer, 1),
      (value->>'count')::integer,
      now()
    from jsonb_array_elements(stats)
    on conflict (route_id, stop_id, hour_of_day, day_of_week) do update set
      -- weighted merge of the existing mean with the incoming batch,
      -- with sample_count capped so one busy week cannot freeze the mean
      mean_delay_sec =
        ((d.mean_delay_sec * d.sample_count)
          + (excluded.mean_delay_sec * excluded.sample_count))
        / greatest(d.sample_count + excluded.sample_count, 1),
      sample_count = least(d.sample_count + excluded.sample_count, 100000),
      updated_at   = now();
  end if;

  -- Inline Automatic Retention: purge raw snapshots older than 30 minutes on every minute tick
  delete from rt_snapshots where captured_at < now() - interval '30 minutes';
end;
$$;

revoke all on function public.ingest_gtfs_snapshots_v2(jsonb, jsonb, jsonb) from public;
grant execute on function public.ingest_gtfs_snapshots_v2(jsonb, jsonb, jsonb) to anon, authenticated, service_role;

-- --------------------------------------------------------- 3. retention job

-- Raw predictions are only useful while the training roll-up is catching up.
create or replace function public.prune_transit_history(days integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
  batch   integer;
begin
  loop
    delete from rt_snapshots
    where ctid in (
      select ctid from rt_snapshots
      where captured_at < now() - make_interval(days => days)
      limit 20000
    );
    get diagnostics batch = row_count;
    removed := removed + batch;
    exit when batch = 0;
  end loop;

  delete from observed_arrivals
  where last_seen_at < now() - interval '2 days';

  return removed;
end;
$$;

revoke all on function public.prune_transit_history(integer) from public;
grant execute on function public.prune_transit_history(integer) to anon, authenticated, service_role;

-- ------------------------------------------------------------ 4. one-off

-- Run these manually, once, after the statements above. They are not part of
-- the function bodies because VACUUM cannot run inside a transaction block.
--
--   select public.prune_transit_history(7);
--   vacuum (analyze) public.rt_snapshots;
--   vacuum (analyze) public.observed_arrivals;
--   vacuum (analyze) public.delay_stats;
