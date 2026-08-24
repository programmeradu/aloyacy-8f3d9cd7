create or replace function ingest_gtfs_snapshots(
  snapshots jsonb,
  observed jsonb,
  stats jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Insert into rt_snapshots
  if jsonb_array_length(snapshots) > 0 then
    insert into rt_snapshots (route_id, stop_id, trip_id, predicted_arrival, delay_sec)
    select 
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'trip_id')::text,
      (value->>'predicted_arrival')::timestamptz,
      (value->>'delay_sec')::integer
    from jsonb_array_elements(snapshots);
  end if;

  -- Upsert into observed_arrivals
  if jsonb_array_length(observed) > 0 then
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
      last_delay_sec = excluded.last_delay_sec,
      last_seen_at = excluded.last_seen_at;
  end if;

  -- Upsert into delay_stats
  if jsonb_array_length(stats) > 0 then
    insert into delay_stats (route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count, updated_at)
    select 
      (value->>'route_id')::text,
      (value->>'stop_id')::text,
      (value->>'hour_of_day')::integer,
      (value->>'day_of_week')::integer,
      (value->>'mean_delay_sec')::double precision,
      (value->>'sample_count')::integer,
      (value->>'updated_at')::timestamptz
    from jsonb_array_elements(stats)
    on conflict (route_id, stop_id, hour_of_day, day_of_week) do update set
      mean_delay_sec = excluded.mean_delay_sec,
      sample_count = excluded.sample_count,
      updated_at = excluded.updated_at;
  end if;

  -- Retention Policy: Cleanup old data
  delete from rt_snapshots where captured_at < now() - interval '30 minutes';
  delete from observed_arrivals where last_seen_at < now() - interval '2 days';
  delete from rider_vehicle_fixes where reported_at < now() - interval '2 days';
  delete from bus_sightings where reported_at < now() - interval '2 days';
end;
$$;
