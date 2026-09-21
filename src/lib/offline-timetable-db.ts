// Client-side IndexedDB Timetable Database for offline transit browsing.
// Stores static trips, stop times, and stop-trips for offline querying.

const DB_NAME = "aloya-timetable-v1";
const DB_VERSION = 1;

export type StopTripEntry = [tripId: string, departureSec: number, routeId: string];
export type StopTimeEntry = [
  stopId: string,
  arrivalSec: number,
  departureSec: number,
  stopSequence: number,
];

export type TripMeta = {
  routeId: string;
  headsign?: string;
  direction?: number;
  feedId?: number;
};

export type OfflineDeparture = {
  tripId: string;
  routeId: string;
  headsign?: string;
  departureSec: number;
  departureTimeStr: string;
};

function formatSecToTime(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function getTodayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function isIndexedDbSupported(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openTimetableDb(): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    return Promise.reject(new Error("IndexedDB is not supported in this environment"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("schedules")) {
        db.createObjectStore("schedules", { keyPath: "date" });
      }
      if (!db.objectStoreNames.contains("trips")) {
        const tripStore = db.createObjectStore("trips", { keyPath: "tripId" });
        tripStore.createIndex("routeId", "routeId", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export async function saveTripsToDb(trips: Record<string, TripMeta>): Promise<void> {
  const db = await openTimetableDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("trips", "readwrite");
    const store = tx.objectStore("trips");
    for (const [tripId, meta] of Object.entries(trips)) {
      store.put({ tripId, ...meta });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveDateScheduleToDb(
  date: string,
  stopTrips: Record<string, StopTripEntry[]>,
  stopTimes: Record<string, StopTimeEntry[]>,
): Promise<void> {
  const db = await openTimetableDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("schedules", "readwrite");
    const store = tx.objectStore("schedules");
    store.put({
      date,
      stopTrips,
      stopTimes,
      savedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTripMeta(tripId: string): Promise<TripMeta | null> {
  const db = await openTimetableDb();
  return new Promise((resolve) => {
    const tx = db.transaction("trips", "readonly");
    const req = tx.objectStore("trips").get(tripId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function getOfflineDeparturesForStop(
  stopId: string,
  date = getTodayYmd(),
  nowSec?: number,
  limit = 20,
): Promise<OfflineDeparture[]> {
  try {
    const db = await openTimetableDb();
    const schedule: any = await new Promise((resolve) => {
      const tx = db.transaction("schedules", "readonly");
      const req = tx.objectStore("schedules").get(date);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!schedule || !schedule.stopTrips) return [];

    // Find entries for this stop (matching either raw stopId or agency:stopId suffix)
    let entries: StopTripEntry[] = schedule.stopTrips[stopId] || [];
    if (entries.length === 0) {
      // Try searching keys ending with :stopId
      for (const k of Object.keys(schedule.stopTrips)) {
        if (k === stopId || k.endsWith(`:${stopId}`)) {
          entries = schedule.stopTrips[k];
          break;
        }
      }
    }

    if (!entries || entries.length === 0) return [];

    const currentSec =
      nowSec ??
      (() => {
        const d = new Date();
        return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      })();

    // Filter upcoming departures and sort
    const upcoming = entries
      .filter((e) => e[1] >= currentSec - 60)
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit);

    return upcoming.map(([tripId, depSec, routeId]) => ({
      tripId,
      routeId,
      departureSec: depSec,
      departureTimeStr: formatSecToTime(depSec),
    }));
  } catch (err) {
    console.warn("[offline-db] Failed to query stop departures", err);
    return [];
  }
}

export async function buildOfflineBoardArrivals(
  routeId: string,
  date = getTodayYmd(),
): Promise<Array<{
  tripId: string;
  stopId: string;
  routeId: string;
  arrivalUnix: number;
  departureUnix: number;
}>> {
  try {
    const db = await openTimetableDb();
    const schedule: any = await new Promise((resolve) => {
      const tx = db.transaction("schedules", "readonly");
      const req = tx.objectStore("schedules").get(date);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    if (!schedule || !schedule.stopTimes) return [];

    // Calculate midnight unix for this date
    const y = parseInt(date.slice(0, 4), 10);
    const m = parseInt(date.slice(4, 6), 10) - 1;
    const d = parseInt(date.slice(6, 8), 10);
    const midnightUnix = Math.floor(new Date(y, m, d).getTime() / 1000);

    // Get all trips for this route from trip store
    const routeTripIds: string[] = await new Promise((resolve) => {
      const tx = db.transaction("trips", "readonly");
      const index = tx.objectStore("trips").index("routeId");
      const req = index.getAllKeys(routeId);
      req.onsuccess = () => resolve((req.result as string[]) || []);
      req.onerror = () => resolve([]);
    });

    const out: Array<{
      tripId: string;
      stopId: string;
      routeId: string;
      arrivalUnix: number;
      departureUnix: number;
    }> = [];

    // Also check trips that end with routeId (feed prefix like "2:405")
    const candidateTrips = new Set(routeTripIds);
    if (candidateTrips.size === 0) {
      for (const tripId of Object.keys(schedule.stopTimes)) {
        // If tripId is in schedule, keep going
        candidateTrips.add(tripId);
      }
    }

    for (const tripId of candidateTrips) {
      const stops: StopTimeEntry[] = schedule.stopTimes[tripId];
      if (!stops) continue;
      for (const [stopId, arrSec, depSec] of stops) {
        // Clean stopId from agency prefix if present (e.g. "2:146" -> "146")
        const cleanStopId = stopId.includes(":") ? stopId.split(":")[1] : stopId;
        out.push({
          tripId,
          stopId: cleanStopId,
          routeId,
          arrivalUnix: midnightUnix + arrSec,
          departureUnix: midnightUnix + depSec,
        });
      }
    }

    return out;
  } catch (err) {
    console.warn("[offline-db] Failed to build offline route arrivals", err);
    return [];
  }
}

export async function clearOfflineTimetableDb(): Promise<void> {
  if (!isIndexedDbSupported()) return;
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
