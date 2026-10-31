// Timetable planning in the browser.
//
// Workers Free gives the Worker 10 ms of CPU per request. Parsing one day of
// the Cyprus timetable takes ~150 ms and the RAPTOR search more on top, so the
// scheduled planner cannot run there (error 1102 killed the isolate and took
// other pages down with it). The browser has no such limit: it downloads the
// day's shard (~1.4 MB brotli, the same static files the offline download
// uses), runs the same pure RAPTOR search, and hands the raw itineraries to
// the server planner, which overlays live times, merges them with the live
// planner's options and ranks everything as before.

import type {
  LoadedSchedule,
  ScheduleRoute,
  ScheduleStop,
  ScheduleTrip,
  StopTimeRow,
  StopTripRow,
} from "./schedule-types";
import { serviceDateToUnix } from "./schedule-types";
import { planRaptor } from "./raptor-plan";
import type { Itinerary } from "./itinerary-types";
import { cyParts } from "@aloya/core/cy-time";

type ShardIndex = Record<string, { trips: number; rows: number }>;

const BASE = "/data/schedule";

export function ymdForUnix(unix: number): string {
  const p = cyParts(unix * 1000);
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

/** Small stable hash, so a new deploy's shards get new URLs (the service
 *  worker serves /data/schedule/* cache-first and keys on the full URL). */
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

let indexPromise: { at: number; p: Promise<{ index: ShardIndex; v: string }> } | null = null;

function loadIndex(): Promise<{ index: ShardIndex; v: string }> {
  // Re-read the index every 10 minutes so a fresh deploy is picked up.
  if (indexPromise && Date.now() - indexPromise.at < 10 * 60_000) return indexPromise.p;
  const bucket = Math.floor(Date.now() / (10 * 60_000));
  const p = (async () => {
    const res = await fetch(`${BASE}/by-date/index.json?t=${bucket}`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`shard index → ${res.status}`);
    const text = await res.text();
    return { index: JSON.parse(text) as ShardIndex, v: hash(text) };
  })();
  indexPromise = { at: Date.now(), p };
  p.catch(() => {
    indexPromise = null;
  });
  return p;
}

type Base = {
  v: string;
  stops: Record<string, ScheduleStop>;
  routes: Record<string, ScheduleRoute>;
  trips: Record<string, ScheduleTrip>;
};
let basePromise: Promise<Base> | null = null;
let baseV = "";

function loadBase(v: string): Promise<Base> {
  if (basePromise && baseV === v) return basePromise;
  baseV = v;
  basePromise = (async () => {
    const [stops, routes, trips] = await Promise.all([
      getJson<Record<string, ScheduleStop>>(`${BASE}/stops.json?v=${v}`),
      getJson<Record<string, ScheduleRoute>>(`${BASE}/routes.json?v=${v}`),
      getJson<Record<string, ScheduleTrip>>(`${BASE}/trips.json?v=${v}`),
    ]);
    return { v, stops, routes, trips };
  })();
  basePromise.catch(() => {
    basePromise = null;
  });
  return basePromise;
}

const shards = new Map<string, Promise<LoadedSchedule>>();

export class NoClientScheduleError extends Error {
  constructor(public date: string) {
    super(`No timetable shard for ${date}`);
  }
}

/** One service day of the timetable, held in memory (at most two days). */
export async function loadClientSchedule(date: string): Promise<LoadedSchedule> {
  const { index, v } = await loadIndex();
  const meta = index[date];
  if (!meta || !meta.trips) throw new NoClientScheduleError(date);
  const key = `${date}|${v}`;
  const hit = shards.get(key);
  if (hit) return hit;
  if (shards.size >= 2) shards.delete(shards.keys().next().value as string);
  const p = (async () => {
    const [base, stopTrips, stopTimes] = await Promise.all([
      loadBase(v),
      getJson<Record<string, StopTripRow[]>>(`${BASE}/by-date/${date}/stop-trips.json?v=${v}`),
      getJson<Record<string, StopTimeRow[]>>(`${BASE}/by-date/${date}/stop-times.json?v=${v}`),
    ]);
    return {
      date,
      stops: base.stops,
      routes: base.routes,
      trips: base.trips,
      stopTrips,
      stopTimes,
    } satisfies LoadedSchedule;
  })();
  shards.set(key, p);
  p.catch(() => shards.delete(key));
  return p;
}

export type ClientScheduledResult = {
  itineraries: Itinerary[];
  serviceDate: string;
  widenedHorizon: boolean;
  rolledToNextDay: boolean;
  ms: number;
};

/**
 * Same escalation as the Worker planner had: "leave now" searches 4 h ahead,
 * then the rest of the service day, then the next service day from its first
 * departure, so the rider gets "first bus at 05:40" instead of a dead end.
 */
export async function planScheduledOnClient(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  opts: {
    departureUnix?: number;
    explicitTime?: boolean;
    date?: string;
    stepFree?: boolean;
    lowFloor?: boolean;
  } = {},
): Promise<ClientScheduledResult> {
  const t0 = performance.now();
  const departureUnix = opts.departureUnix ?? Math.floor(Date.now() / 1000);
  const date = opts.date ?? ymdForUnix(departureUnix);
  const accessibilityPrefs = {
    requireSafeCrossing: !!opts.stepFree,
    requireWheelchair: !!opts.lowFloor,
  };
  const wide = { searchHorizonSec: 24 * 3600, maxJourneySec: 30 * 3600, accessibilityPrefs };

  const schedule = await loadClientSchedule(date);
  let serviceDate = date;
  let widenedHorizon = false;
  let rolledToNextDay = false;
  let { itineraries } = await planRaptor(
    schedule,
    from,
    to,
    departureUnix,
    opts.explicitTime ? wide : { accessibilityPrefs },
  );

  if (!opts.explicitTime && itineraries.length === 0) {
    widenedHorizon = true;
    itineraries = (await planRaptor(schedule, from, to, departureUnix, wide)).itineraries;
    if (itineraries.length === 0) {
      const nextDate = ymdForUnix(departureUnix + 24 * 3600);
      try {
        const next = await loadClientSchedule(nextDate);
        const rolled = await planRaptor(next, from, to, serviceDateToUnix(nextDate, 0), wide);
        if (rolled.itineraries.length > 0) {
          itineraries = rolled.itineraries;
          serviceDate = nextDate;
          rolledToNextDay = true;
        }
      } catch {
        // No shard for tomorrow: keep the empty same-day result.
      }
    }
  }
  for (const it of itineraries) it.source = "estimated";
  return {
    itineraries,
    serviceDate,
    widenedHorizon,
    rolledToNextDay,
    ms: Math.round(performance.now() - t0),
  };
}
