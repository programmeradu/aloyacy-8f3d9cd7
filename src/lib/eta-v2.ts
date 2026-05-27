// =============================================================
// Smart ETA v2 — segment-aware ETA with a real confidence band.
//
// v1 (`src/lib/eta.ts`) snaps the bus to its polyline and divides
// remaining metres by a single speed estimate. That's already
// better than the operator's number, but it has two blind spots:
//
//   1. Speed varies wildly between segments (a school zone right
//      after a motorway run averages out to nothing useful).
//   2. We hand the rider a single number with no honesty about
//      how much we trust it.
//
// v2 fixes both:
//   - per-(route, from_stop, to_stop, hour, dow) mean speeds from
//     `segment_speeds`, with a global fallback when the bucket is
//     sparse;
//   - per-(route, stop, hour, dow) dwell observations instead of a
//     fixed 20s urban / 10s intercity guess;
//   - a p50 / p90 confidence band derived from the sample counts.
//
// This module is pure: caller passes RT + learned stats in, ETA
// + band out. React/Supabase wiring lives elsewhere.
// =============================================================

import type { LiveArrival, LiveVehicle } from "./gtfs-rt.server";
import { getStop, distanceKm } from "./gtfs";

export type SegmentSpeedKey = string; // `${routeId}|${fromStopId}|${toStopId}`
export type DwellKey = string; // `${routeId}|${stopId}`

export type SegmentStatMap = Record<
  SegmentSpeedKey,
  { meanMps: number; sampleCount: number }
>;
export type DwellStatMap = Record<
  DwellKey,
  { meanDwellSec: number; sampleCount: number }
>;

export type SmartEtaV2 = {
  /** Median ETA in seconds. */
  etaSec: number;
  /** Display minutes (rounded). */
  etaMin: number;
  /** Optimistic edge (≈ p25). */
  lowerSec: number;
  /** Pessimistic edge (≈ p90). */
  upperSec: number;
  /** Stops between bus and target. */
  stopsAway: number;
  /** "high" | "medium" | "low" based on sample coverage + freshness. */
  confidence: "high" | "medium" | "low";
  /** Short label e.g. "8–12 min", or "≈10 min". */
  band: string;
  /** Ping age of the vehicle in seconds. */
  pingAgeSec: number;
};

const URBAN_FALLBACK_MPS = 18 / 3.6;
const INTERCITY_FALLBACK_MPS = 40 / 3.6;
const URBAN_DWELL_SEC = 20;
const INTERCITY_DWELL_SEC = 10;
const MIN_SAMPLES_TRUST = 5;

type LatLng = { lat: number; lng: number };

function m(a: LatLng, b: LatLng) {
  return distanceKm(a, b) * 1000;
}

export type SmartEtaV2Input = {
  stopId: string;
  arrivals: LiveArrival[];
  vehicles: LiveVehicle[];
  nowSec?: number;
  agency?: string;
  segments?: SegmentStatMap;
  dwells?: DwellStatMap;
};

export function smartEtaV2(input: SmartEtaV2Input): SmartEtaV2 | null {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const here = input.arrivals
    .filter((a) => a.stopId === input.stopId && a.arrivalUnix >= now - 30)
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix);
  if (here.length === 0) return null;
  const next = here[0];

  const vehicle = input.vehicles.find((v) => v.tripId === next.tripId) ?? null;
  const tripStops = input.arrivals
    .filter((a) => a.tripId === next.tripId)
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix);

  const verts: { stopId: string; lat: number; lng: number }[] = [];
  for (const a of tripStops) {
    const s = getStop(a.stopId);
    if (s) verts.push({ stopId: a.stopId, lat: s.lat, lng: s.lng });
  }
  const targetIdx = verts.findIndex((v) => v.stopId === input.stopId);
  if (targetIdx < 0 || verts.length < 2) {
    const opSec = Math.max(0, next.arrivalUnix - now);
    return {
      etaSec: opSec,
      etaMin: Math.round(opSec / 60),
      lowerSec: opSec,
      upperSec: opSec,
      stopsAway: 0,
      confidence: "low",
      band: `≈${Math.round(opSec / 60)} min`,
      pingAgeSec: vehicle ? Math.max(0, now - vehicle.timestamp) : Infinity,
    };
  }

  // Identify the segment the bus is on (snap by nearest vertex pair).
  let startIdx = 0;
  if (vehicle) {
    let best = Infinity;
    for (let i = 0; i < verts.length - 1; i++) {
      const d =
        m({ lat: vehicle.lat, lng: vehicle.lng }, verts[i]) +
        m({ lat: vehicle.lat, lng: vehicle.lng }, verts[i + 1]);
      if (d < best) {
        best = d;
        startIdx = i;
      }
    }
  }

  const fallbackMps =
    input.agency === "IC" ? INTERCITY_FALLBACK_MPS : URBAN_FALLBACK_MPS;
  const fallbackDwell =
    input.agency === "IC" ? INTERCITY_DWELL_SEC : URBAN_DWELL_SEC;

  let p50 = 0;
  let pessFactor = 1; // pessimistic multiplier (low samples → wider band)
  let segSamples = 0;
  let totalSegs = 0;

  // Partial first segment from vehicle to next vertex (approximate by metres)
  if (vehicle && startIdx < targetIdx) {
    const remainingFirst = Math.max(
      0,
      m({ lat: vehicle.lat, lng: vehicle.lng }, verts[startIdx + 1]),
    );
    const fromId = verts[startIdx].stopId;
    const toId = verts[startIdx + 1].stopId;
    const stat = input.segments?.[`${next.routeId}|${fromId}|${toId}`];
    const speed =
      stat && stat.sampleCount >= MIN_SAMPLES_TRUST
        ? Math.max(2, stat.meanMps)
        : Math.max(2, vehicle.speed ?? fallbackMps);
    p50 += remainingFirst / speed;
    segSamples += stat?.sampleCount ?? 0;
    totalSegs += 1;
    startIdx += 1;
  }

  for (let i = startIdx; i < targetIdx; i++) {
    const fromId = verts[i].stopId;
    const toId = verts[i + 1].stopId;
    const distM = m(verts[i], verts[i + 1]);
    const stat = input.segments?.[`${next.routeId}|${fromId}|${toId}`];
    const speed =
      stat && stat.sampleCount >= MIN_SAMPLES_TRUST
        ? Math.max(2, stat.meanMps)
        : fallbackMps;
    p50 += distM / speed;
    // Dwell at the *arriving* stop (toId), except the target stop itself.
    if (i + 1 < targetIdx) {
      const d = input.dwells?.[`${next.routeId}|${toId}`];
      p50 +=
        d && d.sampleCount >= MIN_SAMPLES_TRUST
          ? Math.max(0, d.meanDwellSec)
          : fallbackDwell;
    }
    segSamples += stat?.sampleCount ?? 0;
    totalSegs += 1;
  }

  // Confidence + band
  const avgSamples = totalSegs > 0 ? segSamples / totalSegs : 0;
  let confidence: SmartEtaV2["confidence"];
  if (avgSamples >= 10) {
    confidence = "high";
    pessFactor = 1.18;
  } else if (avgSamples >= 4) {
    confidence = "medium";
    pessFactor = 1.3;
  } else {
    confidence = "low";
    pessFactor = 1.5;
  }
  const pingAgeSec = vehicle ? Math.max(0, now - vehicle.timestamp) : Infinity;
  if (pingAgeSec > 90) pessFactor += 0.1;

  const lowerSec = Math.max(0, p50 * 0.92);
  const upperSec = p50 * pessFactor;
  const lowerMin = Math.max(0, Math.round(lowerSec / 60));
  const upperMin = Math.max(lowerMin + 1, Math.round(upperSec / 60));
  const etaMin = Math.max(0, Math.round(p50 / 60));

  const band =
    upperMin - lowerMin <= 1
      ? `≈${etaMin} min`
      : `${lowerMin}–${upperMin} min`;

  return {
    etaSec: p50,
    etaMin,
    lowerSec,
    upperSec,
    stopsAway: Math.max(0, targetIdx - startIdx),
    confidence,
    band,
    pingAgeSec,
  };
}
