// Offline GTFS prefetch for the mobile app.
//
// Mirrors the published static schedule shards to the app's document
// directory so route lookups, stop browsing, and trip details keep working
// when there is no signal (basements, intercity dead zones, airplane).
//
// Layout under FileSystem.documentDirectory + "schedule/":
//   feeds.json
//   routes.json
//   services.json
//   stops.json
//   trips.json
//   by-date/<yyyymmdd>/stop-trips.json
//   by-date/<yyyymmdd>/stop-times.json
//
// Status is mirrored to AsyncStorage so the UI can show last-update time
// and total bytes without re-walking the filesystem.

import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

const STATUS_KEY = "aloya.offline.status.v1";
const ROOT = `${FileSystem.documentDirectory ?? ""}schedule/`;
const BY_DATE_ROOT = `${ROOT}by-date/`;

const BASE_FILES = [
  "feeds.json",
  "routes.json",
  "services.json",
  "stops.json",
  "trips.json",
];

export type OfflineStatus = {
  dates: string[];
  lastUpdatedAt: number;
  bytes: number;
};

export type DownloadProgress = {
  total: number;
  done: number;
  currentLabel: string;
};

function ymd(d: Date): string {
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
    out.push(ymd(d));
  }
  return out;
}

export async function getOfflineStatus(): Promise<OfflineStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as OfflineStatus) : null;
  } catch {
    return null;
  }
}

async function saveStatus(s: OfflineStatus): Promise<void> {
  try {
    await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(s));
  } catch {}
}

async function ensureDir(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

async function downloadOne(
  remoteUrl: string,
  localUri: string,
): Promise<{ ok: boolean; bytes: number }> {
  try {
    const res = await FileSystem.downloadAsync(remoteUrl, localUri);
    if (res.status >= 200 && res.status < 300) {
      const info = await FileSystem.getInfoAsync(localUri, { size: true });
      return { ok: true, bytes: info.exists && "size" in info ? (info.size as number) : 0 };
    }
    return { ok: false, bytes: 0 };
  } catch {
    return { ok: false, bytes: 0 };
  }
}

export async function downloadOfflineSchedules(opts: {
  daysAhead?: number;
  onProgress?: (p: DownloadProgress) => void;
}): Promise<OfflineStatus> {
  const daysAhead = Math.max(1, Math.min(14, opts.daysAhead ?? 7));
  const requested = nextDaysYmd(daysAhead);

  // Cross-check with the published by-date index so we don't 404 on dates
  // the static bundle hasn't ingested yet.
  let available: Set<string> | null = null;
  try {
    const idxRes = await fetch(`${API_BASE}/data/schedule/by-date/index.json`, {
      headers: { Accept: "application/json" },
    });
    if (idxRes.ok) {
      const idx = (await idxRes.json()) as Record<string, unknown>;
      available = new Set(Object.keys(idx));
    }
  } catch {}

  const dates = available ? requested.filter((d) => available!.has(d)) : requested;

  await ensureDir(ROOT);
  await ensureDir(BY_DATE_ROOT);

  type Task = { url: string; local: string; date?: string; label: string };
  const tasks: Task[] = BASE_FILES.map((f) => ({
    url: `${API_BASE}/data/schedule/${f}`,
    local: `${ROOT}${f}`,
    label: f,
  }));
  for (const d of dates) {
    const dir = `${BY_DATE_ROOT}${d}/`;
    await ensureDir(dir);
    tasks.push(
      {
        url: `${API_BASE}/data/schedule/by-date/${d}/stop-trips.json`,
        local: `${dir}stop-trips.json`,
        date: d,
        label: `${d}/stop-trips.json`,
      },
      {
        url: `${API_BASE}/data/schedule/by-date/${d}/stop-times.json`,
        local: `${dir}stop-times.json`,
        date: d,
        label: `${d}/stop-times.json`,
      },
    );
  }

  let bytes = 0;
  const cachedDates = new Set<string>();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    opts.onProgress?.({ total: tasks.length, done: i, currentLabel: t.label });
    const r = await downloadOne(t.url, t.local);
    bytes += r.bytes;
    if (r.ok && t.date) cachedDates.add(t.date);
  }
  opts.onProgress?.({ total: tasks.length, done: tasks.length, currentLabel: "Done" });

  const status: OfflineStatus = {
    dates: [...cachedDates].sort(),
    lastUpdatedAt: Date.now(),
    bytes,
  };
  await saveStatus(status);
  return status;
}

export async function clearOfflineSchedules(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(ROOT);
    if (info.exists) await FileSystem.deleteAsync(ROOT, { idempotent: true });
  } catch {}
  try {
    await AsyncStorage.removeItem(STATUS_KEY);
  } catch {}
}

/** Read a cached JSON shard. Returns null when missing or unparseable. */
export async function readCachedJson<T = unknown>(relPath: string): Promise<T | null> {
  try {
    const uri = `${ROOT}${relPath.replace(/^\//, "")}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
