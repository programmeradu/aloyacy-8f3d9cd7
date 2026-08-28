// D2 skip rate — a bus that passed the stop without dwelling.
// Only a completed visit (entry and exit) is evidence. Sparse pings stay
// unknown: a 90 s gap can hide a real dwell. Pure — no clock, no I/O.

import { distanceM, type LatLng } from "./geo";
import { cyHourDow, cyIsWeekend } from "./cy-time";
import { headwayWhen, type HeadwayWhen } from "./headway-chance";
import { VEHICLE_CROSS_RADIUS_M, type VehiclePing } from "./vehicle-cross";

export const SKIP_RADIUS_M = VEHICLE_CROSS_RADIUS_M;
export const SKIP_DWELL_MIN_SEC = 12;
/** Wider than this, a short interpolated dwell is a guess. Fail closed. */
export const SKIP_MAX_CLASSIFY_GAP_MS = 45_000;
export const SKIP_WINDOW_DAYS = 14;
export const SKIP_MIN_N = 8;
export const SKIP_SPEAK_MIN_PCT = 15;

export type SkipOutcome = "served" | "skipped";

export type ClassifiedVisit = {
  outcome: SkipOutcome;
  dwellSec: number;
  gapMs: number;
};

function interpTime(
  a: VehiclePing,
  da: number,
  b: VehiclePing,
  db: number,
  radiusM: number,
  entering: boolean,
): number {
  const gap = b.tMs - a.tMs;
  if (entering) {
    const denom = da - db;
    const frac = denom <= 0 ? 1 : Math.min(1, Math.max(0, (da - radiusM) / denom));
    return Math.round(a.tMs + frac * gap);
  }
  const denom = db - da;
  const frac = denom <= 0 ? 1 : Math.min(1, Math.max(0, (radiusM - da) / denom));
  return Math.round(a.tMs + frac * gap);
}

export function classifyStopVisit(
  pings: VehiclePing[],
  stop: LatLng,
  radiusM = SKIP_RADIUS_M,
): ClassifiedVisit | null {
  if (pings.length < 2) return null;
  const sorted = [...pings].sort((a, b) => a.tMs - b.tMs);
  const dist = sorted.map((p) => distanceM(p, stop));
  let entryI = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (dist[i]! > radiusM && dist[i + 1]! <= radiusM) {
      entryI = i;
      break;
    }
  }
  const startedInside = dist[0]! <= radiusM;
  const searchFrom = entryI >= 0 ? entryI + 1 : 0;
  let exitI = -1;
  for (let i = searchFrom; i < sorted.length - 1; i++) {
    if (dist[i]! <= radiusM && dist[i + 1]! > radiusM) {
      exitI = i;
      break;
    }
  }
  if (exitI < 0) return null;
  const entryT =
    entryI >= 0
      ? interpTime(sorted[entryI]!, dist[entryI]!, sorted[entryI + 1]!, dist[entryI + 1]!, radiusM, true)
      : startedInside
        ? sorted[0]!.tMs
        : null;
  if (entryT == null) return null;
  const exitT = interpTime(
    sorted[exitI]!,
    dist[exitI]!,
    sorted[exitI + 1]!,
    dist[exitI + 1]!,
    radiusM,
    false,
  );
  const dwellSec = Math.max(0, (exitT - entryT) / 1000);
  const gapStart = entryI >= 0 ? sorted[entryI]!.tMs : sorted[0]!.tMs;
  const gapMs = sorted[exitI + 1]!.tMs - gapStart;
  const rounded = Math.round(dwellSec);
  if (dwellSec >= SKIP_DWELL_MIN_SEC) {
    return { outcome: "served", dwellSec: rounded, gapMs };
  }
  if (gapMs > SKIP_MAX_CLASSIFY_GAP_MS) return null;
  return { outcome: "skipped", dwellSec: rounded, gapMs };
}

export type SkipVisitRow = {
  stopId: string;
  routeId: string;
  outcome: SkipOutcome;
  classifiedAt: number;
  hour: number | null;
  dow: number | null;
};

export type SkipSlot = {
  stopId: string;
  routeId: string;
  when: HeadwayWhen;
  n: number;
  skipped: number;
};

export type SkipRate = {
  routeId: string;
  k: number;
  n: number;
  when: HeadwayWhen;
};

export function skipInN(n: number, skipped: number): number {
  if (skipped <= 0 || n <= 0) return 0;
  return Math.max(2, Math.round(n / skipped));
}

/** 1 in k → fraction. k < 2 is not a skip we speak. */
export function skipFraction(k: number): number {
  if (!(k >= 2)) return 0;
  return 1 / k;
}

export function skipMapKey(stopId: string, routeId: string): string {
  return `${stopId}\t${routeId}`;
}

function periodOf(row: SkipVisitRow): HeadwayWhen {
  const hour =
    row.hour != null && row.hour >= 0 && row.hour <= 23
      ? row.hour
      : cyHourDow(row.classifiedAt).hour;
  const weekend =
    row.dow != null ? row.dow === 0 || row.dow === 6 : cyIsWeekend(row.classifiedAt);
  return headwayWhen(hour, weekend);
}

export function skipSlotKey(stopId: string, routeId: string, when: HeadwayWhen): string {
  return `${stopId}|${routeId}|${when}`;
}

export function tallySkipVisits(rows: SkipVisitRow[]): SkipSlot[] {
  const by = new Map<string, SkipSlot>();
  for (const row of rows) {
    if (!row.stopId || !row.routeId) continue;
    if (row.outcome !== "served" && row.outcome !== "skipped") continue;
    const when = periodOf(row);
    const key = skipSlotKey(row.stopId, row.routeId, when);
    const slot = by.get(key) ?? {
      stopId: row.stopId,
      routeId: row.routeId,
      when,
      n: 0,
      skipped: 0,
    };
    slot.n += 1;
    if (row.outcome === "skipped") slot.skipped += 1;
    by.set(key, slot);
  }
  return [...by.values()];
}

export function skipPct(skipped: number, n: number): number {
  if (n <= 0) return 0;
  return Math.round((skipped / n) * 100);
}

export function shouldSpeakSkip(n: number, rawPct: number): boolean {
  if (n < SKIP_MIN_N) return false;
  if (rawPct < SKIP_SPEAK_MIN_PCT) return false;
  return true;
}

export function pickSkipRate(
  slots: SkipSlot[],
  stopId: string,
  routeId: string,
  arrivalUnix: number,
): SkipRate | null {
  const { hour } = cyHourDow(arrivalUnix * 1000);
  const weekend = cyIsWeekend(arrivalUnix * 1000);
  const when = headwayWhen(hour, weekend);
  const slot = slots.find((s) => s.stopId === stopId && s.routeId === routeId && s.when === when);
  if (!slot) return null;
  const raw = skipPct(slot.skipped, slot.n);
  if (!shouldSpeakSkip(slot.n, raw)) return null;
  return { routeId: slot.routeId, k: skipInN(slot.n, slot.skipped), n: slot.n, when };
}

export function pickSkipRates(slots: SkipSlot[], stopId: string, nowMs: number): SkipRate[] {
  const { hour } = cyHourDow(nowMs);
  const when = headwayWhen(hour, cyIsWeekend(nowMs));
  const out: SkipRate[] = [];
  for (const slot of slots) {
    if (slot.stopId !== stopId || slot.when !== when) continue;
    const raw = skipPct(slot.skipped, slot.n);
    if (!shouldSpeakSkip(slot.n, raw)) continue;
    out.push({ routeId: slot.routeId, k: skipInN(slot.n, slot.skipped), n: slot.n, when });
  }
  return out;
}

export function skipRateLine(routeShort: string, k: number, whenLabel: string): string {
  return `Bus ${routeShort} skips this stop about 1 in ${k} ${whenLabel}. Wave clearly.`;
}
