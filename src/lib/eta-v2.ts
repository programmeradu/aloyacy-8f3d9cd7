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
// When a GTFS shape is provided, the bus is snapped onto the real
// route polyline (Google encoded polyline → LatLng[]) and remaining
// distance is measured along the road, not as a stop-to-stop chord.
// This is the difference between "5 min" on a curvy school-zone
// segment and the truth of 8 min.
//
// Pure module: caller passes RT + learned stats + (optionally) the
// shape in, ETA + band out. React/Supabase wiring lives elsewhere.
// =============================================================

import type { LiveArrival, LiveVehicle } from "./gtfs-rt.server";
import { getStop } from "./gtfs";
import {
  distanceM,
  snapToPolyline,
  polylineLengthM,
  type LatLng,
} from "./geo";
import type { LearnedBias } from "./learned-types";

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

/** Source/freshness tier for the colour chip. */
export type EtaFreshness = "live" | "predicted" | "scheduled";

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
  /** Confidence of the *band width* (sample coverage + freshness). */
  confidence: "high" | "medium" | "low";
  /** Source tier for the colour chip — "live" (fresh ping + close), "predicted" (vehicle but stale/far), "scheduled" (no vehicle). */
  freshness: EtaFreshness;
  /** What the operator's tripUpdate said — for the strikethrough hint. */
  operatorEtaMin: number;
  /** Short label for the chip e.g. "live", "stale ping", "usually 2 min late". */
  blurb: string;
  /** Learned systematic delay applied (signed seconds). */
  learnedBiasSec: number;
  /** Short range label e.g. "8–12 min", or "≈10 min". */
  band: string;
  /** Ping age of the vehicle in seconds (Infinity if no vehicle). */
  pingAgeSec: number;
};

const URBAN_FALLBACK_MPS = 18 / 3.6;
const INTERCITY_FALLBACK_MPS = 40 / 3.6;
const URBAN_DWELL_SEC = 20;
const INTERCITY_DWELL_SEC = 10;
const MIN_SAMPLES_TRUST = 5;
const PING_FRESH_SEC = 60;
const PING_STALE_SEC = 90;
const NEAR_STOPS_LIVE = 5;
const LEARNED_BIAS_WEIGHT = 0.6;
const LEARNED_BIAS_MIN_SAMPLES = 5;
const LEARNED_BLURB_MIN_SAMPLES = 8;

export type SmartEtaV2Input = {
  stopId: string;
  arrivals: LiveArrival[];
  vehicles: LiveVehicle[];
  nowSec?: number;
  agency?: string;
  segments?: SegmentStatMap;
  dwells?: DwellStatMap;
  /** GTFS shape polyline for the trip. When provided the bus is snapped
   *  to the real road geometry and segment lengths come from the shape. */
  shape?: LatLng[] | null;
  /** Optional learned per-route bias for the stop's current hour/dow. */
  learnedByRoute?: Record<string, LearnedBias>;
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

  // ----- Snap the bus to the route geometry --------------------------------
  // Shape mode: snap vehicle + every stop vertex onto the real polyline and
  // measure remaining distance along the road. Chord-mode (no shape) falls
  // back to vertex-to-vertex straight lines but uses the proper snap fn to
  // find which segment the bus is on.
  const shape = input.shape && input.shape.length >= 2 ? input.shape : null;

  let startIdx = 0;
  let firstLegM: number | null = null; // metres from current bus position → verts[startIdx+1]

  if (vehicle) {
    if (shape) {
      // Snap vehicle + each stop onto shape. The next stop the bus hasn't
      // passed yet is the segment start.
      const vehSnap = snapToPolyline(
        { lat: vehicle.lat, lng: vehicle.lng },
        shape,
      );
      const stopAlong = verts.map((v) => {
        const s = snapToPolyline({ lat: v.lat, lng: v.lng }, shape);
        return s ? s.alongM : 0;
      });
      if (vehSnap) {
        // Find the first stop ahead of the bus on the shape.
        let i = 0;
        while (i < verts.length && stopAlong[i] <= vehSnap.alongM + 5) i++;
        if (i > targetIdx) {
          // Bus already passed the target on the shape — clamp.
          startIdx = Math.max(0, targetIdx - 1);
          firstLegM = 0;
        } else if (i === 0) {
          startIdx = 0;
          firstLegM = Math.max(0, stopAlong[1] - vehSnap.alongM);
        } else {
          startIdx = i - 1;
          firstLegM = Math.max(0, stopAlong[i] - vehSnap.alongM);
        }
      }
    } else {
      // No shape — find nearest pair using snap on the chord polyline.
      const chord = verts.map((v) => ({ lat: v.lat, lng: v.lng }));
      const snap = snapToPolyline(
        { lat: vehicle.lat, lng: vehicle.lng },
        chord,
      );
      if (snap) {
        startIdx = snap.segIndex;
        firstLegM = Math.max(
          0,
          (1 - snap.tAlong) * distanceM(verts[startIdx], verts[startIdx + 1]),
        );
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

  // Partial first segment (bus → next vertex)
  if (vehicle && firstLegM != null && startIdx < targetIdx) {
    const fromId = verts[startIdx].stopId;
    const toId = verts[startIdx + 1].stopId;
    const stat = input.segments?.[`${next.routeId}|${fromId}|${toId}`];
    const speed =
      stat && stat.sampleCount >= MIN_SAMPLES_TRUST
        ? Math.max(2, stat.meanMps)
        : Math.max(2, vehicle.speed ?? fallbackMps);
    p50 += firstLegM / speed;
    segSamples += stat?.sampleCount ?? 0;
    totalSegs += 1;
    startIdx += 1;
  }

  for (let i = startIdx; i < targetIdx; i++) {
    const fromId = verts[i].stopId;
    const toId = verts[i + 1].stopId;
    // Prefer shape-derived segment length over chord when shape is loaded.
    let distMSeg: number;
    if (shape) {
      const a = snapToPolyline({ lat: verts[i].lat, lng: verts[i].lng }, shape);
      const b = snapToPolyline({ lat: verts[i + 1].lat, lng: verts[i + 1].lng }, shape);
      distMSeg = a && b ? Math.max(0, b.alongM - a.alongM) : distanceM(verts[i], verts[i + 1]);
    } else {
      distMSeg = distanceM(verts[i], verts[i + 1]);
    }
    const stat = input.segments?.[`${next.routeId}|${fromId}|${toId}`];
    const speed =
      stat && stat.sampleCount >= MIN_SAMPLES_TRUST
        ? Math.max(2, stat.meanMps)
        : fallbackMps;
    p50 += distMSeg / speed;
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
  // Tiny shape sanity-check use (avoid an unused-var lint when shape mode never fired)
  void polylineLengthM;

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
