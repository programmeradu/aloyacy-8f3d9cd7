// ============================================================
// GPS fusion layer. One source of truth for the rider's location.
//
// Why this exists:
//  - raw navigator.geolocation pings are noisy (drifts 5-30 m on
//    Cyprus city streets), pause when the screen locks, and die in
//    tunnels and bus shelters.
//  - everything downstream (HUD, alight detection, rider-fix
//    reporter, wrong-stop reroute) needs the SAME smoothed fix.
//
// How it works:
//  - 1D Kalman per axis (lat, lng) with a velocity state. Process
//    noise tuned for walking / urban driving (~12 km/h variability).
//  - Accuracy-weighted measurement noise: a 30 m ping moves the
//    estimate less than a 5 m ping does.
//  - Dead-reckons up to 8 s using the last velocity vector when
//    the GPS stream pauses.
//  - Snap-to-route mode: when the consumer passes an `activePath`
//    (the polyline for the current ride/walk leg) we project the
//    fused fix onto it and prefer the snapped point if cross-track
//    error < 35 m. Kills the "you're 25 m off the bus line"
//    jitter that confuses every other bus app.
//
// Pure TypeScript. No React, no DOM beyond navigator.geolocation
// (gated behind `typeof window !== 'undefined'`).
// ============================================================

import type { LatLng } from "./shapes";

export type RawFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: number; // ms
};

export type FusedFix = {
  lat: number;
  lng: number;
  /** Smoothed speed in m/s. Always >= 0. */
  speedMps: number;
  /** Smoothed bearing 0-360. null while not enough motion to compute. */
  bearingDeg: number | null;
  /** Best estimate of horizontal uncertainty in metres (1-sigma). */
  uncertaintyM: number;
  /** ms timestamp this fix is valid at. */
  timestamp: number;
  /** Was this produced by dead-reckoning rather than a fresh fix? */
  deadReckoned: boolean;
  /** Inferred motion mode. */
  motion: "still" | "walking" | "onboard";
  /** True when the fix was snapped onto an `activePath`. */
  snapped: boolean;
};

// ---- Tunables -------------------------------------------------

const M_PER_DEG_LAT = 110_540;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

// Process noise (m/s^2). How much we expect the rider to accelerate
// between samples. Higher = more responsive, more jittery.
const Q_ACCEL = 1.5;

// Measurement noise floor in metres. If the browser reports
// accuracy below this we still treat it as this noisy.
const R_MIN = 4;

// Dead reckoning budget.
const DR_BUDGET_MS = 8_000;

// Snap-to-route: only adopt the snapped point if perpendicular
// distance to the polyline is below this. Above it we trust the
// raw fused fix (rider is genuinely off-route).
const SNAP_MAX_M = 35;

// Motion classifier thresholds.
const STILL_MAX_MPS = 0.5;
const WALK_MAX_MPS = 2.8;

// ---- Internal state ------------------------------------------

type AxisState = {
  /** Position in metres relative to anchor. */
  x: number;
  /** Velocity in m/s. */
  v: number;
  /** Covariance matrix [[p00, p01], [p10, p11]]. */
  p00: number;
  p01: number;
  p10: number;
  p11: number;
};

function newAxis(): AxisState {
  return { x: 0, v: 0, p00: 500, p01: 0, p10: 0, p11: 50 };
}

function predict(s: AxisState, dt: number) {
  s.x += s.v * dt;
  const q = Q_ACCEL * Q_ACCEL;
  // F = [[1, dt], [0, 1]];  Q = q * [[dt^4/4, dt^3/2], [dt^3/2, dt^2]]
  const dt2 = dt * dt;
  const dt3 = dt2 * dt;
  const dt4 = dt3 * dt;
  const p00 = s.p00 + dt * (s.p01 + s.p10) + dt2 * s.p11 + (q * dt4) / 4;
  const p01 = s.p01 + dt * s.p11 + (q * dt3) / 2;
  const p10 = s.p10 + dt * s.p11 + (q * dt3) / 2;
  const p11 = s.p11 + q * dt2;
  s.p00 = p00;
  s.p01 = p01;
  s.p10 = p10;
  s.p11 = p11;
}

function update(s: AxisState, z: number, r: number) {
  // Measurement: H = [1, 0]
  const y = z - s.x;
  const sCov = s.p00 + r;
  const k0 = s.p00 / sCov;
  const k1 = s.p10 / sCov;
  s.x += k0 * y;
  s.v += k1 * y;
  const p00 = (1 - k0) * s.p00;
  const p01 = (1 - k0) * s.p01;
  const p10 = s.p10 - k1 * s.p00;
  const p11 = s.p11 - k1 * s.p01;
  s.p00 = p00;
  s.p01 = p01;
  s.p10 = p10;
  s.p11 = p11;
}

// ---- Snap-to-polyline (great-circle approx, local equirect) --

function snapToPath(
  p: LatLng,
  path: LatLng[],
): { lat: number; lng: number; crossM: number } | null {
  if (path.length < 2) return null;
  const mLat = M_PER_DEG_LAT;
  const mLng = mPerDegLng(p.lat);
  const toXY = (q: LatLng) => ({
    x: (q.lng - p.lng) * mLng,
    y: (q.lat - p.lat) * mLat,
  });
  let best: { x: number; y: number; d2: number } | null = null;
  const xy = path.map(toXY);
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = -(a.x * dx + a.y * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const fx = a.x + t * dx;
    const fy = a.y + t * dy;
    const d2 = fx * fx + fy * fy;
    if (!best || d2 < best.d2) best = { x: fx, y: fy, d2 };
  }
  if (!best) return null;
  const crossM = Math.sqrt(best.d2);
  return {
    lat: p.lat + best.y / mLat,
    lng: p.lng + best.x / mLng,
    crossM,
  };
}

// ---- Fuser ----------------------------------------------------

export class GeoFuser {
  private anchorLat: number | null = null;
  private anchorLng: number | null = null;
  private latS = newAxis();
  private lngS = newAxis();
  private lastFixAt = 0;
  private lastEmitAt = 0;
  private bearing: number | null = null;
  private hasFix = false;

  /** Feed a raw browser fix. Returns the new fused fix. */
  ingest(raw: RawFix, activePath?: LatLng[] | null): FusedFix {
    const now = raw.timestamp;
    if (this.anchorLat == null || this.anchorLng == null) {
      this.anchorLat = raw.lat;
      this.anchorLng = raw.lng;
    }

    const z = this.toLocal(raw.lat, raw.lng);
    const r = Math.max(R_MIN, raw.accuracyM) ** 2;

    if (this.hasFix) {
      const dt = Math.min(10, Math.max(0.05, (now - this.lastFixAt) / 1000));
      predict(this.latS, dt);
      predict(this.lngS, dt);
    } else {
      this.latS.x = z.y;
      this.lngS.x = z.x;
    }
    update(this.latS, z.y, r);
    update(this.lngS, z.x, r);
    this.hasFix = true;
    this.lastFixAt = now;
    this.lastEmitAt = now;

    if (raw.headingDeg != null && (raw.speedMps ?? 0) > 1.5) {
      this.bearing = raw.headingDeg;
    } else {
      const vx = this.lngS.v;
      const vy = this.latS.v;
      const speed = Math.hypot(vx, vy);
      if (speed > 0.8) {
        const deg = (Math.atan2(vx, vy) * 180) / Math.PI;
        this.bearing = (deg + 360) % 360;
      }
    }

    return this.emit(now, activePath, false);
  }

  /** Produce a dead-reckoned fix at `nowMs` without a new sensor reading. */
  extrapolate(nowMs: number, activePath?: LatLng[] | null): FusedFix | null {
    if (!this.hasFix) return null;
    if (nowMs - this.lastFixAt > DR_BUDGET_MS) {
      // Past the dead-reckoning budget. Freeze velocity and stop
      // advancing position.
      this.latS.v *= 0.5;
      this.lngS.v *= 0.5;
      return this.emit(nowMs, activePath, true);
    }
    const dt = Math.max(0.05, (nowMs - this.lastEmitAt) / 1000);
    predict(this.latS, dt);
    predict(this.lngS, dt);
    this.lastEmitAt = nowMs;
    return this.emit(nowMs, activePath, true);
  }

  private emit(
    nowMs: number,
    activePath: LatLng[] | null | undefined,
    deadReckoned: boolean,
  ): FusedFix {
    const { lat, lng } = this.toLatLng(this.lngS.x, this.latS.x);
    const vx = this.lngS.v;
    const vy = this.latS.v;
    const speedMps = Math.max(0, Math.hypot(vx, vy));
    const uncertaintyM = Math.sqrt(
      Math.max(this.latS.p00, 0) + Math.max(this.lngS.p00, 0),
    );

    let outLat = lat;
    let outLng = lng;
    let snapped = false;
    if (activePath && activePath.length >= 2) {
      const snap = snapToPath({ lat, lng }, activePath);
      if (snap && snap.crossM < SNAP_MAX_M) {
        // Blend toward the snapped point proportional to how
        // confident we are in the polyline (close = trust path).
        const w = 1 - snap.crossM / SNAP_MAX_M; // 0..1
        outLat = lat * (1 - w) + snap.lat * w;
        outLng = lng * (1 - w) + snap.lng * w;
        snapped = true;
      }
    }

    let motion: FusedFix["motion"] = "still";
    if (speedMps > WALK_MAX_MPS) motion = "onboard";
    else if (speedMps > STILL_MAX_MPS) motion = "walking";

    return {
      lat: outLat,
      lng: outLng,
      speedMps,
      bearingDeg: this.bearing,
      uncertaintyM,
      timestamp: nowMs,
      deadReckoned,
      motion,
      snapped,
    };
  }

  private toLocal(lat: number, lng: number) {
    const aLat = this.anchorLat!;
    const aLng = this.anchorLng!;
    return {
      x: (lng - aLng) * mPerDegLng(aLat),
      y: (lat - aLat) * M_PER_DEG_LAT,
    };
  }

  private toLatLng(x: number, y: number) {
    const aLat = this.anchorLat!;
    const aLng = this.anchorLng!;
    return {
      lat: aLat + y / M_PER_DEG_LAT,
      lng: aLng + x / mPerDegLng(aLat),
    };
  }
}

/** Convenience for snapping a single point in one shot. */
export function snapPointToPath(p: LatLng, path: LatLng[]) {
  return snapToPath(p, path);
}
