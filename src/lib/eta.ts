// ============================================================
// Smart ETA — compute an ETA we trust, from where the bus
// actually is. Replaces blind use of the operator's predicted
// arrival time.
//
// Method:
//   1. Find the bus's trip + that trip's ordered stop sequence.
//   2. Build a polyline through the stop coordinates (proxy for
//      the GTFS shape until we wire shapes.txt server-side).
//   3. Snap the bus's lat/lng onto that polyline → distance-along.
//   4. Remaining distance to the target stop ÷ rolling speed
//      estimate + dwell time per intermediate stop.
//   5. Confidence tier from freshness + stops-away + which inputs
//      were usable.
//
// Inputs are kept narrow (no React, no Supabase) so this runs
// purely client-side from the realtime snapshot + stops.json.
// ============================================================

import type { LiveArrival, LiveVehicle } from "./gtfs-rt.server";
import { getStop, distanceKm } from "./gtfs";

export type SmartEta = {
  /** Final corrected ETA in seconds (>= 0). */
  etaSec: number;
  /** Rounded minutes for display. */
  etaMin: number;
  /** What the operator's tripUpdate said (for comparison / fallback). */
  operatorEtaMin: number | null;
  /** Confidence tier driving the colour chip. */
  confidence: "live" | "predicted" | "scheduled";
  /** Age of the vehicle ping in seconds (Infinity if no vehicle). */
  pingAgeSec: number;
  /** Stops between the bus and the target. */
  stopsAway: number | null;
  /** Short human label for the chip ("live", "stale ping", etc). */
  blurb: string;
  /** Learned systematic delay applied (seconds, signed). */
  learnedBiasSec: number;
};

// Tunables. Urban Cyprus speeds tend to be slow; intercity faster.
const SPEED_FLOOR_MPS = 2.5;          // ~9 km/h — kill divide-by-zero
const SPEED_CEILING_MPS = 24;         // ~86 km/h
const URBAN_FALLBACK_MPS = 18 / 3.6;  // 18 km/h
const INTERCITY_FALLBACK_MPS = 40 / 3.6;
const DWELL_SEC_URBAN = 20;
const DWELL_SEC_INTERCITY = 10;
const PING_FRESH_SEC = 60;
const PING_STALE_SEC = 90;
const NEAR_STOPS_LIVE = 5;

type LatLng = { lat: number; lng: number };

function metresBetween(a: LatLng, b: LatLng): number {
  return distanceKm(a, b) * 1000;
}

/** Snap point p onto polyline; return cumulative distance along the line up to the foot of perpendicular (metres). */
function snapDistanceAlong(p: LatLng, polyline: LatLng[]): {
  along: number;
  total: number;
  segIndex: number;
} | null {
  if (polyline.length < 2) return null;
  // Convert to a local equirectangular projection around p so we can do
  // segment-perpendicular math in metres without spherical pain. Accuracy
  // is plenty for sub-km segments at Cyprus latitudes.
  const M_PER_DEG_LAT = 110_540;
  const M_PER_DEG_LNG = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const toXY = (q: LatLng) => ({
    x: (q.lng - p.lng) * M_PER_DEG_LNG,
    y: (q.lat - p.lat) * M_PER_DEG_LAT,
  });

  let bestSeg = 0;
  let bestDist = Infinity;
  let bestT = 0;
  const xy = polyline.map(toXY);

  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    // p is origin (0,0), so projection = -(a·d)/len2 simplified
    let t = -(a.x * dx + a.y * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx;
    const fy = a.y + t * dy;
    const d2 = fx * fx + fy * fy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestSeg = i;
      bestT = t;
    }
  }

  // cumulative along distance up to bestSeg, then partial segment
  let along = 0;
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const segLen = metresBetween(polyline[i], polyline[i + 1]);
    if (i === bestSeg) along = total + segLen * bestT;
    total += segLen;
  }
  return { along, total, segIndex: bestSeg };
}

/** Distance-along-polyline of a vertex (i.e. a stop). */
function vertexDistanceAlong(polyline: LatLng[], vertexIdx: number): number {
  let d = 0;
  for (let i = 0; i < vertexIdx; i++) {
    d += metresBetween(polyline[i], polyline[i + 1]);
  }
  return d;
}

export type LearnedBias = {
  /** Mean delay in seconds (positive = systematically late). */
  meanDelaySec: number;
  /** Sample size — drives how much weight we give the bias. */
  sampleCount: number;
};

export type SmartEtaInput = {
  /** Target stop the user wants the ETA for. */
  stopId: string;
  /** All RT arrivals (already in snapshot). */
  arrivals: LiveArrival[];
  /** All RT vehicles. */
  vehicles: LiveVehicle[];
  /** Snapshot fetchedAt (for ping-age). */
  nowSec?: number;
  /** Optional: route agency hint ("IC" → intercity). */
  agency?: string;
  /**
   * Optional learned per-(route,stop,hour,dow) bias from delay_stats.
   * Indexed by routeId — the caller looks up the row matching the
   * chosen trip's route. When present and sample size is meaningful,
   * we add this systematic delay onto our distance-based ETA.
   */
  learnedByRoute?: Record<string, LearnedBias>;
};

/**
 * Pick the soonest believable arrival for `stopId`, then refine its ETA
 * using the corresponding vehicle's actual position.
 */
export function smartEtaForStop(input: SmartEtaInput): SmartEta | null {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);

  // Operator-predicted arrivals at this stop, sorted ascending.
  const here = input.arrivals
    .filter((a) => a.stopId === input.stopId && a.arrivalUnix >= now - 30)
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix);
  if (here.length === 0) return null;

  const next = here[0];
  const operatorEtaSec = Math.max(0, next.arrivalUnix - now);
  const operatorEtaMin = Math.round(operatorEtaSec / 60);

  // Vehicle currently running that trip (if any).
  const vehicle = input.vehicles.find((v) => v.tripId === next.tripId) ?? null;

  // Trip's full ordered stop sequence (from the same feed).
  const tripStops = input.arrivals
    .filter((a) => a.tripId === next.tripId)
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix);

  // Build the polyline from stop coordinates (proxy for the route shape).
  const polyVerts: { stopId: string; lat: number; lng: number }[] = [];
  for (const a of tripStops) {
    const s = getStop(a.stopId);
    if (s) polyVerts.push({ stopId: a.stopId, lat: s.lat, lng: s.lng });
  }
  const targetIdx = polyVerts.findIndex((v) => v.stopId === input.stopId);

  // Learned bias for this route+stop at this hour/dow. Only trust it
  // when we have a meaningful sample (>= 5 observations).
  const learned = input.learnedByRoute?.[next.routeId];
  const learnedBiasSec =
    learned && learned.sampleCount >= 5 ? learned.meanDelaySec : 0;

  // No vehicle, or trip path too thin to reason about → fall back to operator.
  if (!vehicle || polyVerts.length < 2 || targetIdx < 0) {
    // Even without a vehicle we can apply learned bias to the operator's number.
    const adjusted = Math.max(0, operatorEtaSec + learnedBiasSec * 0.6);
    return {
      etaSec: adjusted,
      etaMin: Math.max(0, Math.round(adjusted / 60)),
      operatorEtaMin,
      confidence: vehicle ? "predicted" : "scheduled",
      pingAgeSec: vehicle ? Math.max(0, now - vehicle.timestamp) : Infinity,
      stopsAway: null,
      blurb: vehicle ? "predicted" : "scheduled",
      learnedBiasSec,
    };
  }

  const pingAgeSec = Math.max(0, now - vehicle.timestamp);
  const snap = snapDistanceAlong({ lat: vehicle.lat, lng: vehicle.lng }, polyVerts);
  if (!snap) {
    const adjusted = Math.max(0, operatorEtaSec + learnedBiasSec * 0.6);
    return {
      etaSec: adjusted,
      etaMin: Math.max(0, Math.round(adjusted / 60)),
      operatorEtaMin,
      confidence: "predicted",
      pingAgeSec,
      stopsAway: null,
      blurb: "predicted",
      learnedBiasSec,
    };
  }

  const targetAlong = vertexDistanceAlong(polyVerts, targetIdx);
  const remainingM = Math.max(0, targetAlong - snap.along);

  // How many *intermediate* stops between the snapped point and the target?
  const stopsAway = Math.max(0, targetIdx - snap.segIndex - 1);
  const dwellPerStop = input.agency === "IC" ? DWELL_SEC_INTERCITY : DWELL_SEC_URBAN;
  const dwellSec = stopsAway * dwellPerStop;

  // Speed estimate. Prefer the vehicle's live speed; if it's unrealistically
  // low (stopped at a light) or absent, use an urban/intercity fallback.
  let speedMps = vehicle.speed ?? 0;
  if (!Number.isFinite(speedMps) || speedMps < SPEED_FLOOR_MPS) {
    speedMps = input.agency === "IC" ? INTERCITY_FALLBACK_MPS : URBAN_FALLBACK_MPS;
  }
  speedMps = Math.min(SPEED_CEILING_MPS, speedMps);

  const travelSec = remainingM / speedMps;
  let etaSec = travelSec + dwellSec;

  // Blend with operator prediction when our ping is stale — they may have
  // newer information than we do.
  if (pingAgeSec > PING_STALE_SEC) {
    etaSec = 0.7 * operatorEtaSec + 0.3 * etaSec;
  } else if (pingAgeSec > PING_FRESH_SEC) {
    etaSec = 0.5 * operatorEtaSec + 0.5 * etaSec;
  }

  // Add learned systematic bias. We scale it down a bit because our
  // distance + speed model already reflects part of "running late" via
  // observed speed — applying the full bias would double-count.
  etaSec += learnedBiasSec * 0.6;

  // Sanity clamp.
  etaSec = Math.max(0, etaSec);
  if (remainingM > 100 && etaSec < 30) etaSec = 30;

  let confidence: SmartEta["confidence"];
  let blurb: string;
  if (pingAgeSec <= PING_FRESH_SEC && stopsAway <= NEAR_STOPS_LIVE) {
    confidence = "live";
    blurb = "live";
  } else if (pingAgeSec <= PING_STALE_SEC) {
    confidence = "predicted";
    blurb = "predicted";
  } else {
    confidence = "predicted";
    blurb = pingAgeSec > 240 ? "stale ping" : "predicted";
  }

  // Surface the learned bias in the blurb when it's material and we
  // weren't already saying something more urgent.
  if (
    blurb === "live" || blurb === "predicted"
  ) {
    const biasMin = Math.round(learnedBiasSec / 60);
    if (learned && learned.sampleCount >= 8 && Math.abs(biasMin) >= 2) {
      blurb = biasMin > 0 ? `usually ${biasMin} min late` : `usually ${-biasMin} min early`;
    }
  }

  return {
    etaSec,
    etaMin: Math.max(0, Math.round(etaSec / 60)),
    operatorEtaMin,
    confidence,
    pingAgeSec,
    stopsAway,
    blurb,
    learnedBiasSec,
  };
}
