// ============================================================
// Bus gliding. Animates vehicle markers between GTFS-RT pings
// instead of jumping on each fetch.
//
// Design:
//  - One animator per active map. Vehicles register their target
//    pose (lat, lng, bearing, speedMps, recordedAt). The animator
//    runs a single requestAnimationFrame loop and emits the
//    interpolated pose for each via a listener callback.
//  - Between pings, the marker is tweened from its current pose
//    toward the most recent target using cubic-out over
//    min(pingInterval, 6 s).
//  - Once the tween completes, we extrapolate along the last
//    bearing at the last speed (capped) for up to 8 more seconds,
//    so the bus keeps moving when the feed lags.
//  - Bearing eases shortest-arc.
//
// Pure DOM-free math: the consumer (map component) reads
// animator.getPose(vehicleId) inside its own rAF / map redraw.
// ============================================================

export type VehicleTarget = {
  id: string;
  lat: number;
  lng: number;
  bearingDeg: number | null;
  speedMps: number | null;
  /** ms the upstream feed recorded this pose. */
  recordedAt: number;
};

export type AnimatedPose = {
  id: string;
  lat: number;
  lng: number;
  bearingDeg: number;
  /** True while the marker is still catching up to its target. */
  catchingUp: boolean;
};

type Track = {
  from: { lat: number; lng: number; bearing: number };
  to: { lat: number; lng: number; bearing: number };
  speedMps: number;
  /** ms when we started tweening from "from" to "to". */
  tweenStart: number;
  /** ms over which to complete the tween. */
  tweenDuration: number;
  /** ms when the last target was set. Used for extrapolation budget. */
  targetSetAt: number;
};

const EXTRAPOLATE_BUDGET_MS = 8_000;
const TWEEN_MIN_MS = 800;
const TWEEN_MAX_MS = 6_000;
const SPEED_FLOOR_MPS = 2;
const SPEED_CEILING_MPS = 22;

function shortestArcEase(from: number, to: number, t: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

function cubicOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function metresPerDegLat() {
  return 110_540;
}
function metresPerDegLng(lat: number) {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export class VehicleAnimator {
  private tracks = new Map<string, Track>();
  private lastIntervalByVehicle = new Map<string, number>();
  private lastTargetAt = new Map<string, number>();

  setTarget(t: VehicleTarget) {
    const prevAt = this.lastTargetAt.get(t.id);
    const interval = prevAt ? Math.max(800, t.recordedAt - prevAt) : 3_000;
    this.lastIntervalByVehicle.set(t.id, interval);
    this.lastTargetAt.set(t.id, t.recordedAt);

    const bearingTo = t.bearingDeg ?? 0;
    const speed = Math.min(
      SPEED_CEILING_MPS,
      Math.max(0, t.speedMps ?? 0),
    );
    const existing = this.tracks.get(t.id);
    const now = performance.now();
    const from = existing
      ? this.poseAt(existing, now)
      : { lat: t.lat, lng: t.lng, bearing: bearingTo };

    this.tracks.set(t.id, {
      from,
      to: { lat: t.lat, lng: t.lng, bearing: bearingTo },
      speedMps: speed,
      tweenStart: now,
      tweenDuration: Math.min(TWEEN_MAX_MS, Math.max(TWEEN_MIN_MS, interval)),
      targetSetAt: now,
    });
  }

  remove(id: string) {
    this.tracks.delete(id);
    this.lastIntervalByVehicle.delete(id);
    this.lastTargetAt.delete(id);
  }

  /** Read the interpolated pose for a vehicle at the current frame. */
  getPose(id: string): AnimatedPose | null {
    const tr = this.tracks.get(id);
    if (!tr) return null;
    const p = this.poseAt(tr, performance.now());
    return {
      id,
      lat: p.lat,
      lng: p.lng,
      bearingDeg: p.bearing,
      catchingUp: performance.now() - tr.tweenStart < tr.tweenDuration,
    };
  }

  private poseAt(tr: Track, now: number): {
    lat: number;
    lng: number;
    bearing: number;
  } {
    const elapsed = now - tr.tweenStart;
    if (elapsed <= tr.tweenDuration) {
      const t = cubicOut(Math.min(1, elapsed / tr.tweenDuration));
      return {
        lat: tr.from.lat + (tr.to.lat - tr.from.lat) * t,
        lng: tr.from.lng + (tr.to.lng - tr.from.lng) * t,
        bearing: shortestArcEase(tr.from.bearing, tr.to.bearing, t),
      };
    }
    // Past the tween: extrapolate along bearing at the last
    // observed speed, but only for the extrapolation budget.
    const overshoot = elapsed - tr.tweenDuration;
    const budget = Math.min(overshoot, EXTRAPOLATE_BUDGET_MS);
    const distM = Math.max(SPEED_FLOOR_MPS, tr.speedMps) * (budget / 1000);
    const rad = (tr.to.bearing * Math.PI) / 180;
    const dx = Math.sin(rad) * distM;
    const dy = Math.cos(rad) * distM;
    return {
      lat: tr.to.lat + dy / metresPerDegLat(),
      lng: tr.to.lng + dx / metresPerDegLng(tr.to.lat),
      bearing: tr.to.bearing,
    };
  }
}
