// Lazy loader for the static schedule bundle in public/data/schedule/.
//
// Cold-path: fetch the per-date shard from the origin (served as a static
// asset by the Worker). Warm-path: served from an in-memory module-scope
// cache that survives across requests within the same isolate.
//
// We deliberately load only what we need:
//   - stops.json + trips.json + routes.json: small, loaded once.
//   - per-date stop-trips + stop-times: ~6 MB raw per day; loaded on demand
//     and cached for up to 1h, then evicted if memory is tight.
//
// Loading the global stop-times.json / stop-trips.json (~50 MB) is avoided
// entirely on the Worker.

import { getRequest } from "@tanstack/react-start/server";

export type ScheduleStop = { name: string; lat: number; lng: number; feedId: number };
export type ScheduleRoute = { short: string; long: string; color: string; feedId: number; type: number };
export type ScheduleTrip = { routeId: string; serviceId: string; direction: 0 | 1; headsign: string; feedId: number };
export type StopTimeRow = [string, number, number, number]; // [stopId, depSec, arrSec, seq]
export type StopTripRow = [string, number, string]; // [tripId, depSec, routeId]

type DateShard = {
  stopTrips: Record<string, StopTripRow[]>;
  stopTimes: Record<string, StopTimeRow[]>;
  loadedAt: number;
};

let _stops: Record<string, ScheduleStop> | null = null;
let _routes: Record<string, ScheduleRoute> | null = null;
let _trips: Record<string, ScheduleTrip> | null = null;
const _shards = new Map<string, DateShard>();
const SHARD_TTL_MS = 60 * 60 * 1000; // 1h

function candidateUrls(path: string): string[] {
  const urls: string[] = [];
  // Prefer the Supabase Storage `schedule` bucket — refreshed nightly by the
  // pg_cron job, no redeploy needed. `path` is /data/schedule/<rest>, so we
  // strip the prefix when mapping to the bucket key.
  const bucketKey = path.replace(/^\/data\/schedule\//, "");
  const supaUrl = process.env.SUPABASE_URL;
  if (supaUrl) urls.push(`${supaUrl}/storage/v1/object/public/schedule/${bucketKey}`);
  // Fallback: the bundled snapshot in /public, served by the origin.
  try {
    const req = getRequest();
    if (req) urls.push(new URL(path, req.url).toString());
  } catch {
    // not in a request context
  }
  if (process.env.PUBLIC_SITE_URL) urls.push(new URL(path, process.env.PUBLIC_SITE_URL).toString());
  urls.push(new URL(path, "https://app.aloyacy.live").toString());
  urls.push(new URL(path, "https://project--cb91f9c9-a30e-4540-948c-0683f1088d6c-dev.lovable.app").toString());
  return [...new Set(urls)];
}

async function fetchJson<T>(path: string): Promise<T> {
  const urls = candidateUrls(path);
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        errors.push(`${url} → ${res.status}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (err) {
      errors.push(`${url} → ${(err as Error).message}`);
    }
  }
  throw new Error(`fetch ${path} failed: ${errors.join("; ")}`);
}

export async function loadStops(): Promise<Record<string, ScheduleStop>> {
  if (!_stops) _stops = await fetchJson<Record<string, ScheduleStop>>("/data/schedule/stops.json");
  return _stops;
}

export async function loadRoutes(): Promise<Record<string, ScheduleRoute>> {
  if (!_routes) _routes = await fetchJson<Record<string, ScheduleRoute>>("/data/schedule/routes.json");
  return _routes;
}

export async function loadTrips(): Promise<Record<string, ScheduleTrip>> {
  if (!_trips) _trips = await fetchJson<Record<string, ScheduleTrip>>("/data/schedule/trips.json");
  return _trips;
}

export function todayLocalDate(offsetDays = 0): string {
  // Cyprus is UTC+2/+3. The schedule's service dates are local calendar
  // dates, so we use the user's local date. The Worker has no local TZ,
  // so we approximate by UTC+3 (Cyprus summer); off-by-one near midnight
  // is acceptable for a planner that already searches the current + next day.
  const now = new Date(Date.now() + (3 + offsetDays * 24) * 3600 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

export async function loadShard(date: string): Promise<DateShard> {
  const cached = _shards.get(date);
  if (cached && Date.now() - cached.loadedAt < SHARD_TTL_MS) return cached;

  // Evict old shards before loading new ones (keep at most 3 in memory).
  if (_shards.size >= 3) {
    const oldest = [..._shards.entries()].sort((a, b) => a[1].loadedAt - b[1].loadedAt)[0];
    if (oldest) _shards.delete(oldest[0]);
  }

  const [stopTrips, stopTimes] = await Promise.all([
    fetchJson<Record<string, StopTripRow[]>>(`/data/schedule/by-date/${date}/stop-trips.json`),
    fetchJson<Record<string, StopTimeRow[]>>(`/data/schedule/by-date/${date}/stop-times.json`),
  ]);
  const shard: DateShard = { stopTrips, stopTimes, loadedAt: Date.now() };
  _shards.set(date, shard);
  return shard;
}

export type LoadedSchedule = {
  date: string;
  stops: Record<string, ScheduleStop>;
  routes: Record<string, ScheduleRoute>;
  trips: Record<string, ScheduleTrip>;
  stopTrips: Record<string, StopTripRow[]>;
  stopTimes: Record<string, StopTimeRow[]>;
};

export async function loadScheduleForDate(date: string): Promise<LoadedSchedule> {
  const [stops, routes, trips, shard] = await Promise.all([
    loadStops(),
    loadRoutes(),
    loadTrips(),
    loadShard(date),
  ]);
  return { date, stops, routes, trips, stopTrips: shard.stopTrips, stopTimes: shard.stopTimes };
}

/** Convert HH:MM:SS-since-service-midnight + service date → unix seconds.
 *  GTFS values may exceed 86400 (post-midnight on same operating day). */
export function serviceDateToUnix(date: string, secSinceMidnight: number): number {
  // date is YYYYMMDD in Cyprus local time. Midnight local = UTC-3 (summer).
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6)) - 1;
  const d = Number(date.slice(6, 8));
  // Cyprus is UTC+3 in summer (DST). Off-by-an-hour in winter is acceptable
  // for a search horizon of a few hours; the realtime overlay corrects exact
  // times for any leg whose tripId matches the live feed.
  const midnightUtcMs = Date.UTC(y, m, d) - 3 * 3600 * 1000;
  return Math.floor(midnightUtcMs / 1000) + secSinceMidnight;
}
