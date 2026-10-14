// Lazy loader for the static schedule bundle in public/data/schedule/.
//
// Cold-path: read the per-date shard through the Worker's ASSETS binding
// (bundled static assets), then R2. Warm-path: served from an in-memory module-scope
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
export type ScheduleRoute = {
  short: string;
  long: string;
  color: string;
  feedId: number;
  type: number;
};
export type ScheduleTrip = {
  routeId: string;
  serviceId: string;
  direction: 0 | 1;
  headsign: string;
  feedId: number;
};
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

type AssetsBinding = { fetch: (req: Request) => Promise<Response> };
type R2ObjectBodyLike = { json<T>(): Promise<T> };
type R2BucketLike = { get: (key: string) => Promise<R2ObjectBodyLike | null> };
type ScheduleEnv = { ASSETS?: AssetsBinding; SCHEDULE?: R2BucketLike; DATA_LAKE?: R2BucketLike };

/** Worker bindings: `cloudflare:workers` env first (works outside a request,
 *  e.g. in scheduled()), then the env server.ts stashes on every fetch. */
async function scheduleEnv(): Promise<ScheduleEnv> {
  try {
    const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env?: ScheduleEnv };
    if (mod?.env && (mod.env.ASSETS || mod.env.DATA_LAKE || mod.env.SCHEDULE)) return mod.env;
  } catch {
    // not running on workerd (node tests, vite dev)
  }
  try {
    const { getWorkerEnv } = await import("./worker-env");
    return (getWorkerEnv() ?? {}) as ScheduleEnv;
  } catch {
    return {};
  }
}

/** Last-resort HTTP origins for the bundled snapshot in /public. A Worker
 *  cannot reliably fetch its own hostname, so these only help in dev/tests. */
function originUrls(path: string): string[] {
  const urls: string[] = [];
  try {
    const req = getRequest();
    if (req) urls.push(new URL(path, req.url).toString());
  } catch {
    // not in a request context
  }
  if (process.env.PUBLIC_SITE_URL) urls.push(new URL(path, process.env.PUBLIC_SITE_URL).toString());
  urls.push(new URL(path, "https://app.aloya.cy").toString());
  return [...new Set(urls)];
}

// Read order: ASSETS binding (bundled shards, no self-subrequest) → R2
// (`schedule/<rest>` in SCHEDULE or DATA_LAKE, refreshed by ingest-schedule)
// → HTTP origin fallback. Supabase Storage is no longer a source.
async function fetchJson<T>(path: string): Promise<T> {
  const errors: string[] = [];
  const env = await scheduleEnv();

  if (env.ASSETS) {
    try {
      const res = await env.ASSETS.fetch(new Request(`https://assets.local${path}`));
      if (res.ok) return (await res.json()) as T;
      errors.push(`ASSETS ${path} → ${res.status}`);
    } catch (err) {
      errors.push(`ASSETS ${path} → ${(err as Error).message}`);
    }
  }

  const bucket = env.SCHEDULE ?? env.DATA_LAKE;
  if (bucket) {
    const key = `schedule/${path.replace(/^\/data\/schedule\//, "")}`;
    try {
      const obj = await bucket.get(key);
      if (obj) return await obj.json<T>();
      errors.push(`R2 ${key} → 404`);
    } catch (err) {
      errors.push(`R2 ${key} → ${(err as Error).message}`);
    }
  }

  for (const url of originUrls(path)) {
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
  if (!_routes)
    _routes = await fetchJson<Record<string, ScheduleRoute>>("/data/schedule/routes.json");
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

/** Dates whose shard is not published. Re-fetching a known 404 on every plan
 *  is pure latency, so a miss is remembered for a few minutes. */
const _missingShards = new Map<string, number>();
const MISS_TTL_MS = 5 * 60_000;

export async function loadShard(date: string): Promise<DateShard> {
  const cached = _shards.get(date);
  if (cached && Date.now() - cached.loadedAt < SHARD_TTL_MS) return cached;

  const missedAt = _missingShards.get(date);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) {
    throw new Error(`schedule shard ${date} → 404 (cached miss)`);
  }

  // Evict old shards before loading new ones (keep at most 3 in memory).
  if (_shards.size >= 3) {
    const oldest = [..._shards.entries()].sort((a, b) => a[1].loadedAt - b[1].loadedAt)[0];
    if (oldest) _shards.delete(oldest[0]);
  }

  let stopTrips: Record<string, StopTripRow[]>;
  let stopTimes: Record<string, StopTimeRow[]>;
  try {
    [stopTrips, stopTimes] = await Promise.all([
      fetchJson<Record<string, StopTripRow[]>>(`/data/schedule/by-date/${date}/stop-trips.json`),
      fetchJson<Record<string, StopTimeRow[]>>(`/data/schedule/by-date/${date}/stop-times.json`),
    ]);
  } catch (err) {
    if (/404/.test((err as Error).message ?? "")) _missingShards.set(date, Date.now());
    throw err;
  }
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
