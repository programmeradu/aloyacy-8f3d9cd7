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
import {
  classifyFreshness,
  type FreshnessTier,
} from "./freshness";



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
  /** Legacy source tier — kept for back-compat. New code reads `tier`. */
  freshness: EtaFreshness;
  /** Rich trust tier used by EtaPill: live / rider-confirmed / predicted / ghost / scheduled. */
  tier: FreshnessTier;
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
const PING_STALE_SEC = 90;

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
  /** Seconds since the most recent rider-confirmed sighting of this trip.
   *  When set and within the trust window, the classifier upgrades the
   *  trip to the `rider-confirmed` tier — overriding ghost / stale ping. */
  riderConfirmedAgeSec?: number;
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

  // Learned per-route bias (applied at the end so it composes with both
  // distance-based and operator-fallback ETAs equally).
  const learned = input.learnedByRoute?.[next.routeId];
  const learnedBiasSec =
    learned && learned.sampleCount >= LEARNED_BIAS_MIN_SAMPLES
      ? learned.meanDelaySec
      : 0;

  const operatorEtaSec = Math.max(0, next.arrivalUnix - now);
  const operatorEtaMin = Math.round(operatorEtaSec / 60);
  const rawPingAgeSec = vehicle ? Math.max(0, now - vehicle.timestamp) : Infinity;
  // A rider sighting acts as a synthetic fresh ping: use min(real ping age,
  // sighting age) so the classifier sees a young enough signal to upgrade.
  const sightingAge = input.riderConfirmedAgeSec;
  const riderConfirmed =
    typeof sightingAge === "number" && Number.isFinite(sightingAge);
  const pingAgeSec = riderConfirmed
    ? Math.min(rawPingAgeSec, sightingAge as number)
    : rawPingAgeSec;
  const hasVehicleForClassifier = !!vehicle || riderConfirmed;

  const verts: { stopId: string; lat: number; lng: number }[] = [];
  for (const a of tripStops) {
    const s = getStop(a.stopId);
    if (s) verts.push({ stopId: a.stopId, lat: s.lat, lng: s.lng });
  }
  const targetIdx = verts.findIndex((v) => v.stopId === input.stopId);

  // ----- Fallback path: no usable geometry, lean on the operator number. ---
  if (targetIdx < 0 || verts.length < 2) {
    const adjusted = Math.max(
      0,
      operatorEtaSec + learnedBiasSec * LEARNED_BIAS_WEIGHT,
    );
    const adjMin = Math.max(0, Math.round(adjusted / 60));
    const cls = classifyFreshness({
      hasVehicle: hasVehicleForClassifier,
      pingAgeSec,
      riderConfirmed,
      agency: input.agency,
      stopsAway: 0,
      modelSamples: 0,
    });
    const freshness: EtaFreshness =
      cls.tier === "ghost" || cls.tier === "scheduled"
        ? "scheduled"
        : cls.tier === "predicted"
          ? "predicted"
          : "live";
    return {
      etaSec: adjusted,
      etaMin: adjMin,
      lowerSec: adjusted,
      upperSec: adjusted,
      stopsAway: 0,
      confidence: cls.confidence,
      freshness,
      tier: cls.tier,
      operatorEtaMin,
      blurb: blurbFor(cls.tier, pingAgeSec, learned, learnedBiasSec),
      learnedBiasSec,
      band: `≈${adjMin} min`,
      pingAgeSec,
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
      const vehSnap = snapToPolyline(
        { lat: vehicle.lat, lng: vehicle.lng },
        shape,
      );
      const stopAlong = verts.map((v) => {
        const s = snapToPolyline({ lat: v.lat, lng: v.lng }, shape);
        return s ? s.alongM : 0;
      });
      if (vehSnap) {
        let i = 0;
        while (i < verts.length && stopAlong[i] <= vehSnap.alongM + 5) i++;
        if (i > targetIdx) {
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

  // Apply learned systematic bias on top of the distance-based estimate.
  // Scaled by LEARNED_BIAS_WEIGHT because the speed model already absorbs
  // part of "running late" via observed segment speeds.
  p50 = Math.max(0, p50 + learnedBiasSec * LEARNED_BIAS_WEIGHT);

  // Confidence + band
  const avgSamples = totalSegs > 0 ? segSamples / totalSegs : 0;
  const stopsAway = Math.max(0, targetIdx - startIdx);
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
  if (pingAgeSec > PING_STALE_SEC) pessFactor += 0.1;
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

  // Freshness — shared classifier is source of truth. Map its rich `tier`
  // back to the legacy three-value `freshness` field for back-compat (ghost
  // collapses to "scheduled" so older consumers visibly demote, not lie).
  const cls = classifyFreshness({
    hasVehicle: hasVehicleForClassifier,
    pingAgeSec,
    riderConfirmed,
    agency: input.agency,
    stopsAway,
    modelSamples: avgSamples,
  });
  const freshness: EtaFreshness =
    cls.tier === "ghost" || cls.tier === "scheduled"
      ? "scheduled"
      : cls.tier === "predicted"
        ? "predicted"
        : "live";

  return {
    etaSec: p50,
    etaMin,
    lowerSec,
    upperSec,
    stopsAway,
    confidence: cls.confidence,
    freshness,
    tier: cls.tier,
    operatorEtaMin,
    blurb: blurbFor(cls.tier, pingAgeSec, learned, learnedBiasSec),
    learnedBiasSec,
    band,
    pingAgeSec,
  };
}


function blurbFor(
  tier: FreshnessTier,
  pingAgeSec: number,
  learned: LearnedBias | undefined,
  learnedBiasSec: number,
): string {
  // Surface a learned-pattern blurb when the sample is meaningful and we
  // still have some live signal to back it.
  const biasMin = Math.round(learnedBiasSec / 60);
  if (
    learned &&
    learned.sampleCount >= LEARNED_BLURB_MIN_SAMPLES &&
    Math.abs(biasMin) >= 2 &&
    (tier === "live" || tier === "rider-confirmed" || tier === "predicted")
  ) {
    return biasMin > 0
      ? `usually ${biasMin} min late`
      : `usually ${-biasMin} min early`;
  }
  if (tier === "ghost") return "no gps — using schedule";
  if (tier === "scheduled") return "scheduled";
  if (tier === "rider-confirmed") return "rider-confirmed";
  if (tier === "predicted" && pingAgeSec > 240) return "stale ping";
  return tier;
}

