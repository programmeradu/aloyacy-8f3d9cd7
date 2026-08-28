// Plausibility of a rider GPS fix *before* it is folded into the live bus.
// Auth stops a random script. This stops a car on the same road, a 90 km/h
// urban ping, and a jump backwards along the trip. Pure — no clock, no I/O.
// Fusion weights by the score; rows below FOLD_MIN stay in the table
// but do not move the marker.

import { distanceM, snapToPolyline, type LatLng } from "./geo";

export const SNAP_SOFT_M = 40;
export const SNAP_HARD_M = 80;
export const ACCURACY_BEST_M = 5;
export const ACCURACY_HARD_M = 80;
export const URBAN_MAX_MPS = 22;
export const IC_MAX_MPS = 33;
export const BACKTRACK_M = 80;
export const DWELL_WINDOW_MS = 180_000;
export const DWELL_ALONG_M = 400;
export const DWELL_STILL_MPS = 0.8;
export const RIDER_PHYSICS_FOLD_MIN = 0.25;
export const RIDER_PHYSICS_OVERRIDE_MIN = 0.6;

export type RiderFixSample = {
  lat: number;
  lng: number;
  tMs: number;
  speedMps?: number | null;
  accuracyM?: number | null;
};

export type RiderPhysicsInput = {
  fix: RiderFixSample;
  prior: RiderFixSample[];
  shape?: LatLng[] | null;
  agency?: string;
};

export type RiderPhysicsResult = {
  score: number;
  snapM: number | null;
  alongM: number | null;
  impliedMps: number | null;
};

export type RiderFold = "skip" | "place" | "override";

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function maxMps(agency?: string): number {
  return agency === "IC" ? IC_MAX_MPS : URBAN_MAX_MPS;
}

function accuracyFactor(accuracyM: number | null | undefined): number {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return 0.7;
  if (accuracyM > ACCURACY_HARD_M) return 0;
  if (accuracyM <= ACCURACY_BEST_M) return 1;
  return clamp01(1 - (accuracyM - ACCURACY_BEST_M) / (ACCURACY_HARD_M - ACCURACY_BEST_M));
}

function snapFactor(crossM: number | null): number {
  if (crossM == null) return 1;
  if (crossM <= SNAP_SOFT_M) return 1;
  if (crossM >= SNAP_HARD_M) return 0;
  return clamp01(1 - (crossM - SNAP_SOFT_M) / (SNAP_HARD_M - SNAP_SOFT_M));
}

function speedFactor(mps: number | null, cap: number): number {
  if (mps == null || !Number.isFinite(mps) || mps < 0) return 1;
  if (mps > cap) return 0;
  return 1;
}

function impliedSpeed(from: RiderFixSample, to: RiderFixSample): number | null {
  const dt = (to.tMs - from.tMs) / 1000;
  if (dt < 1) return null;
  return distanceM({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) / dt;
}

function dwellFactor(
  prior: RiderFixSample[],
  alongNow: number | null,
  alongThen: number | null,
): number {
  if (prior.length < 3 || alongNow == null || alongThen == null) return 1;
  const span = prior[prior.length - 1]!.tMs - prior[0]!.tMs;
  if (span < DWELL_WINDOW_MS) return 1;
  if (alongNow - alongThen < DWELL_ALONG_M) return 1;
  const still = prior.some((p, i) => {
    const reported = p.speedMps;
    if (reported != null && reported < DWELL_STILL_MPS) return true;
    if (i === 0) return false;
    const implied = impliedSpeed(prior[i - 1]!, p);
    return implied != null && implied < DWELL_STILL_MPS;
  });
  return still ? 1 : 0.4;
}

export function scoreRiderFix(input: RiderPhysicsInput): RiderPhysicsResult {
  const cap = maxMps(input.agency);
  const fix = input.fix;
  const snap =
    input.shape && input.shape.length >= 2
      ? snapToPolyline({ lat: fix.lat, lng: fix.lng }, input.shape)
      : null;
  const last = input.prior.length > 0 ? input.prior[input.prior.length - 1] : null;
  const lastSnap =
    last && input.shape && input.shape.length >= 2
      ? snapToPolyline({ lat: last.lat, lng: last.lng }, input.shape)
      : null;

  const implied = last ? impliedSpeed(last, fix) : null;
  let progress = 1;
  if (snap && lastSnap && snap.alongM + BACKTRACK_M < lastSnap.alongM) progress = 0.1;

  const firstAlong =
    input.prior[0] && input.shape && input.shape.length >= 2
      ? (snapToPolyline({ lat: input.prior[0].lat, lng: input.prior[0].lng }, input.shape)
          ?.alongM ?? null)
      : null;

  const score = clamp01(
    accuracyFactor(fix.accuracyM) *
      snapFactor(snap?.crossM ?? null) *
      speedFactor(fix.speedMps ?? null, cap) *
      speedFactor(implied, cap * 1.15) *
      progress *
      dwellFactor(input.prior, snap?.alongM ?? null, firstAlong),
  );

  return {
    score: Math.round(score * 100) / 100,
    snapM: snap ? Math.round(snap.crossM) : null,
    alongM: snap ? Math.round(snap.alongM) : null,
    impliedMps: implied == null ? null : Math.round(implied * 10) / 10,
  };
}

/**
 * How a scored rider fix meets the live feed.
 * Unscored (null) folds as today — the column is new.
 * < 0.25 never moves the marker.
 * ≥ 0.6 can overlay a stale feed ping.
 * 0.25–0.6 only appears when the feed has nothing for that trip.
 */
export function riderFold(score: number | null | undefined, hasUpstream: boolean): RiderFold {
  const s = score == null ? 1 : score;
  if (s < RIDER_PHYSICS_FOLD_MIN) return "skip";
  if (!hasUpstream) return "place";
  if (s >= RIDER_PHYSICS_OVERRIDE_MIN) return "override";
  return "skip";
}
