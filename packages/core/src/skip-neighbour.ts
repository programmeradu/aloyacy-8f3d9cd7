// D2 neighbour of a skipped stop. Same route, measured walk, named from
// the stop we already have. No 200 m north unless the coords say so.
// A neighbour that also skips is not an alternative.

import { bearingDeg, distanceM, type LatLng } from "./geo";
import { cyHourDow, cyIsWeekend } from "./cy-time";
import { headwayWhen } from "./headway-chance";
import {
  shouldSpeakSkip,
  skipPct,
  type SkipRate,
  type SkipSlot,
} from "./skip-rate";

/** Closer than this is the same cluster (two poles, one skip). */
export const SKIP_NEIGHBOUR_MIN_M = 80;
/** Farther than this is a new journey, not a wave-or-walk. */
export const SKIP_NEIGHBOUR_MAX_M = 400;

export type Compass = "north" | "south" | "east" | "west";

export type NeighbourCandidate = {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
};

export type SkipNeighbour = {
  stopId: string;
  name: string;
  meters: number;
  compass: Compass;
};

export type SpokenSkip = SkipRate & { neighbour: SkipNeighbour | null };

export function compassOf(from: LatLng, to: LatLng): Compass {
  const deg = bearingDeg(from, to);
  if (deg >= 315 || deg < 45) return "north";
  if (deg < 135) return "east";
  if (deg < 225) return "south";
  return "west";
}

export function roundWalkM(meters: number): number {
  return Math.max(10, Math.round(meters / 10) * 10);
}

export function pickSkipNeighbour(
  here: NeighbourCandidate,
  routeId: string,
  candidates: NeighbourCandidate[],
  slots: SkipSlot[],
  nowMs: number,
): SkipNeighbour | null {
  if (!here.stopId || !routeId) return null;
  if (!Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return null;
  const { hour } = cyHourDow(nowMs);
  const when = headwayWhen(hour, cyIsWeekend(nowMs));
  let best: SkipNeighbour | null = null;
  let bestRaw = Infinity;
  for (const c of candidates) {
    if (c.stopId === here.stopId) continue;
    const name = c.name.trim();
    if (!name) continue;
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
    const raw = distanceM(here, c);
    if (raw < SKIP_NEIGHBOUR_MIN_M || raw > SKIP_NEIGHBOUR_MAX_M) continue;
    const meters = roundWalkM(raw);
    if (meters < SKIP_NEIGHBOUR_MIN_M || meters > SKIP_NEIGHBOUR_MAX_M) continue;
    const slot = slots.find(
      (s) => s.stopId === c.stopId && s.routeId === routeId && s.when === when,
    );
    if (slot && shouldSpeakSkip(slot.n, skipPct(slot.skipped, slot.n))) continue;
    if (raw >= bestRaw) continue;
    bestRaw = raw;
    best = { stopId: c.stopId, name, meters, compass: compassOf(here, c) };
  }
  return best;
}

export function skipRateNeighbourLine(
  routeShort: string,
  k: number,
  whenLabel: string,
  stopName: string,
  meters: number,
  compass: Compass,
): string {
  return `Bus ${routeShort} skips this stop about 1 in ${k} ${whenLabel}. Wave clearly, or use ${stopName} ${meters} m ${compass}.`;
}
