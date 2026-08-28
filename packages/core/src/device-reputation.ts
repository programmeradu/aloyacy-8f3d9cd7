// C2 reputation. A phone is trusted when its GPS, near a stop, agreed
// with arrival_truth. Volume of taps is not a reputation. Pure — no I/O.

import { distanceM, type LatLng } from "./geo";
import { SNAP_HARD_M, RIDER_PHYSICS_FOLD_MIN } from "./rider-physics";
import { CORROBORATION_MIN } from "./freshness";

export const REP_WINDOW_DAYS = 14;
export const REP_MIN_N = 5;
export const REP_HIGH = 0.75;
/** Closest fix must be this close in time to count as a sample. */
export const REP_MAX_GAP_SEC = 180;
/** Inside this error the sample is a hit. */
export const REP_HIT_SEC = 90;

/** Inside this window a tap and a GPS ping can corroborate each other. */
export const SOURCE_WINDOW_SEC = 90;

export type ReputationTruth = {
  tripId: string;
  stopId: string;
  routeId: string;
  actualMs: number;
};

export type ReputationFix = {
  tripId: string;
  deviceId: string;
  lat: number;
  lng: number;
  tMs: number;
};

export type DeviceReputation = {
  score: number;
  n: number;
  canCarry: boolean;
};

export type SightingRow = {
  tripId: string;
  deviceId: string;
  ageSec: number;
};

export type GpsReport = {
  tripId: string;
  deviceId: string;
  ageSec: number;
  /** Absent on legacy rows — treat as foldable. */
  physicsScore?: number | null;
};

export type FoldedSighting = {
  tripId: string;
  ageSec: number;
  count: number;
  canCarry: boolean;
};

export function canCarryAlone(score: number, n: number): boolean {
  return n >= REP_MIN_N && score >= REP_HIGH;
}

export function scoreDeviceReputation(errorSec: number[]): DeviceReputation {
  const samples = errorSec.filter((e) => Number.isFinite(e) && e >= 0 && e <= REP_MAX_GAP_SEC);
  const n = samples.length;
  if (n === 0) return { score: 0, n: 0, canCarry: false };
  const hits = samples.filter((e) => e <= REP_HIT_SEC).length;
  const score = Math.round((hits / n) * 1000) / 1000;
  return { score, n, canCarry: canCarryAlone(score, n) };
}

export function errorsByDevice(
  truths: ReputationTruth[],
  fixes: ReputationFix[],
  stopOf: (stopId: string, routeId: string) => LatLng | null,
): Map<string, number[]> {
  const fixesByTrip = new Map<string, ReputationFix[]>();
  for (const f of fixes) {
    if (!f.deviceId || !f.tripId) continue;
    const list = fixesByTrip.get(f.tripId);
    if (list) list.push(f);
    else fixesByTrip.set(f.tripId, [f]);
  }
  const out = new Map<string, number[]>();
  for (const t of truths) {
    const stop = stopOf(t.stopId, t.routeId);
    if (!stop) continue;
    const tripFixes = fixesByTrip.get(t.tripId);
    if (!tripFixes) continue;
    const byDevice = new Map<string, ReputationFix[]>();
    for (const f of tripFixes) {
      const list = byDevice.get(f.deviceId);
      if (list) list.push(f);
      else byDevice.set(f.deviceId, [f]);
    }
    for (const [deviceId, df] of byDevice) {
      const near = df.filter((f) => distanceM({ lat: f.lat, lng: f.lng }, stop) <= SNAP_HARD_M);
      if (near.length === 0) continue;
      let best = Infinity;
      for (const f of near) {
        const e = Math.abs(f.tMs - t.actualMs) / 1000;
        if (e < best) best = e;
      }
      if (best > REP_MAX_GAP_SEC) continue;
      const arr = out.get(deviceId);
      if (arr) arr.push(best);
      else out.set(deviceId, [best]);
    }
  }
  return out;
}

/** GPS pings that may join a tap as a second source. A car on the road does not. */
export function gpsReportsToSightings(fixes: GpsReport[]): SightingRow[] {
  const out: SightingRow[] = [];
  for (const f of fixes) {
    if (!f.tripId || !f.deviceId) continue;
    if (f.ageSec < 0 || f.ageSec >= SOURCE_WINDOW_SEC) continue;
    if (f.physicsScore != null && f.physicsScore < RIDER_PHYSICS_FOLD_MIN) continue;
    out.push({ tripId: f.tripId, deviceId: f.deviceId, ageSec: f.ageSec });
  }
  return out;
}

export function foldSightings(rows: SightingRow[], carryDevices: Set<string>): FoldedSighting[] {
  const byTrip = new Map<string, { ageSec: number; devices: Set<string> }>();
  for (const r of rows) {
    if (!r.tripId || !r.deviceId) continue;
    const existing = byTrip.get(r.tripId);
    if (existing) {
      existing.devices.add(r.deviceId);
      existing.ageSec = Math.min(existing.ageSec, r.ageSec);
    } else {
      byTrip.set(r.tripId, { ageSec: r.ageSec, devices: new Set([r.deviceId]) });
    }
  }
  return [...byTrip.entries()].map(([tripId, a]) => ({
    tripId,
    ageSec: a.ageSec,
    count: a.devices.size,
    canCarry: [...a.devices].some((d) => carryDevices.has(d)),
  }));
}

/** Classifier input: a high-rep lone phone counts as corroborated. */
export function effectiveRiderSources(count: number | undefined, canCarry: boolean): number {
  const n = typeof count === "number" && count >= 1 ? count : 1;
  return canCarry ? Math.max(n, CORROBORATION_MIN) : n;
}
