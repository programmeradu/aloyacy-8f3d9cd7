// Offline schedule cache manager.
//
// Pre-downloads the static GTFS shards (base + N upcoming day shards) into
// the `aloya-schedule-v1` Cache Storage bucket. The service worker serves
// `/data/schedule/*` cache-first so subsequent reads work offline.

import {
  saveTripsToDb,
  saveDateScheduleToDb,
  clearOfflineTimetableDb,
  isIndexedDbSupported,
} from "./offline-timetable-db";

const SCHEDULE_CACHE = "aloya-schedule-v1";
const STATUS_KEY = "aloya.offline.status.v1";

const BASE_FILES = [
  "/data/schedule/feeds.json",
  "/data/schedule/routes.json",
  "/data/schedule/services.json",
  "/data/schedule/stops.json",
  "/data/schedule/trips.json",
];

export type OfflineStatus = {
  dates: string[]; // yyyymmdd cached
  lastUpdatedAt: number; // unix ms
  bytes: number; // approx
};

export type DownloadProgress = {
  total: number;
  done: number;
  currentLabel: string;
};

function todayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function nextDaysYmd(daysAhead: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push(todayYmd(d));
  }
  return out;
}

function loadStatus(): OfflineStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as OfflineStatus) : null;
  } catch {
    return null;
  }
}

function saveStatus(s: OfflineStatus) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
  } catch {}
}

// The Worker serves /data/schedule/* from R2 (fresh nightly ingest) with the
// bundled static snapshot as fallback; /media/schedule/* is the raw R2 object.
async function fetchScheduleAsset(path: string, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(path, init);
    if (res.ok) return res;
  } catch {}
  const bucketKey = path.replace(/^\/data\/schedule\//, "");
  return await fetch(`/media/schedule/${bucketKey}`, init);
}

export function getOfflineStatus(): OfflineStatus | null {
  return loadStatus();
}

export function isOfflineCacheSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

async function cacheUrl(cache: Cache, url: string): Promise<{ ok: boolean; bytes: number }> {
  try {
    const res = await fetchScheduleAsset(url, { cache: "no-cache" });
    if (!res.ok) return { ok: false, bytes: 0 };
    const clone = res.clone();
    await cache.put(url, res);
    const buf = await clone.arrayBuffer();
    return { ok: true, bytes: buf.byteLength };
  } catch {
    return { ok: false, bytes: 0 };
  }
}

export async function downloadOfflineSchedules(opts: {
  daysAhead?: number;
  onProgress?: (p: DownloadProgress) => void;
}): Promise<OfflineStatus> {
  if (!isOfflineCacheSupported()) {
    throw new Error("Offline cache is not supported in this browser.");
  }
  const daysAhead = Math.max(1, Math.min(14, opts.daysAhead ?? 7));
  const requested = nextDaysYmd(daysAhead);

  // Intersect with the published by-date index so we don't 404 on dates
  // the static bundle hasn't been ingested for yet.
  let available: Set<string> | null = null;
  try {
    const idxRes = await fetchScheduleAsset("/data/schedule/by-date/index.json", {
      cache: "no-cache",
    });
    if (idxRes.ok) {
      const idx = (await idxRes.json()) as Record<string, unknown>;
      available = new Set(Object.keys(idx));
    }
  } catch {}


  const dates = available ? requested.filter((d) => available!.has(d)) : requested;
  const dateUrls = dates.flatMap((d) => [
    `/data/schedule/by-date/${d}/stop-trips.json`,
    `/data/schedule/by-date/${d}/stop-times.json`,
  ]);
  const all = [...BASE_FILES, ...dateUrls];
  const cache = await caches.open(SCHEDULE_CACHE);
  let bytes = 0;
  const cachedDates = new Set<string>();

  for (let i = 0; i < all.length; i++) {
    const url = all[i];
    opts.onProgress?.({
      total: all.length,
      done: i,
      currentLabel: url.split("/").pop() ?? url,
    });
    const r = await cacheUrl(cache, url);
    bytes += r.bytes;
    if (r.ok) {
      const m = url.match(/by-date\/(\d{8})\//);
      if (m) cachedDates.add(m[1]);
    }
  }

  // Index downloaded data into IndexedDB for fast offline querying
  if (isIndexedDbSupported()) {
    try {
      opts.onProgress?.({
        total: all.length,
        done: all.length,
        currentLabel: "Indexing offline database...",
      });
      const tripsRes = await cache.match("/data/schedule/trips.json");
      if (tripsRes) {
        const trips = await tripsRes.json();
        await saveTripsToDb(trips);
      }
      for (const d of cachedDates) {
        const stRes = await cache.match(`/data/schedule/by-date/${d}/stop-times.json`);
        const tripRes = await cache.match(`/data/schedule/by-date/${d}/stop-trips.json`);
        if (stRes && tripRes) {
          const stopTimes = await stRes.json();
          const stopTrips = await tripRes.json();
          await saveDateScheduleToDb(d, stopTrips, stopTimes);
        }
      }
    } catch (dbErr) {
      console.warn("[offline-schedules] Failed to index into IndexedDB:", dbErr);
    }
  }

  opts.onProgress?.({ total: all.length, done: all.length, currentLabel: "Done" });

  const status: OfflineStatus = {
    dates: [...cachedDates].sort(),
    lastUpdatedAt: Date.now(),
    bytes,
  };
  saveStatus(status);
  return status;
}

export async function clearOfflineSchedules(): Promise<void> {
  if (!isOfflineCacheSupported()) return;
  await caches.delete(SCHEDULE_CACHE);
  await clearOfflineTimetableDb();
  try {
    localStorage.removeItem(STATUS_KEY);
  } catch {}
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
