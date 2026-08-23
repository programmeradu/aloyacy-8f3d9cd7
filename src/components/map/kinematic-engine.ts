// Pure kinematic dead-reckoning engine for live bus glides.
// Extracted from AnimatedBus so motion math runs in unit tests and keeps
// the Map OverlayView focused on DOM updates.

import { distanceM as haversineM } from "@aloya/core/geo";
import { densifyPath, lerp, sampleAlong, snapAlong } from "@aloya/core/path-geometry";

export const TWEEN_MS = 5500;
export const MAX_SNAP_M = 90;
export const PATH_ATTACH_M = 180;
export const TELEPORT_M = 400;
export const SETTLE_S = 1.5;
export const FAST_SETTLE_S = 0.4;
export const CORRECTION_TAU = 0.6;
export const DENSIFY_MAX_M = 25;
export const SPEED_SMOOTH = 0.55;
export const BEARING_SLEW_PER_S = 6;
export const EASE = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export interface KinematicState {
  lat: number;
  lng: number;
  bearing: number;
  boarding: boolean;
}

export interface KinematicDebugSnapshot {
  lat: number;
  lng: number;
  bearing: number;
  speedMps: number;
  speedKmh: number;
  pingAgeMs: number;
  mode: "path" | "lerp";
  hasPath: boolean;
  pathTotalM: number;
  alongM: number;
  correctionVel: number;
  boarding: boolean;
}

export class KinematicBusEngine {
  private fromLat: number;
  private fromLng: number;
  private fromBearing: number;
  private toLat: number;
  private toLng: number;
  private toBearing: number;
  private bearingDelta = 0;
  private tweenStart = 0;
  private tweenDur = TWEEN_MS;
  private currentBearing: number;

  private srcPath: { lat: number; lng: number }[] | null = null;
  private path: { lat: number; lng: number }[] | null = null;
  private cum: number[] = [];
  private pathTotal = 0;
  private displayedAlong = 0;
  private speedMps = 0;
  private lastPingMs = 0;
  private lastPingLat = 0;
  private lastPingLng = 0;
  private lastTs = 0;
  private correctionVel = 0;
  private lastTickMs = 0;
  private usePath = false;
  private boarding = false;
  private curLat: number;
  private curLng: number;

  constructor(pos: { lat: number; lng: number }, bearing: number) {
    this.fromLat = this.toLat = this.curLat = pos.lat;
    this.fromLng = this.toLng = this.curLng = pos.lng;
    this.fromBearing = this.toBearing = this.currentBearing = bearing;
  }

  setPath(path: { lat: number; lng: number }[] | null) {
    if (!path || path.length < 2) {
      this.srcPath = null;
      this.path = null;
      this.cum = [];
      this.pathTotal = 0;
      this.usePath = false;
      return;
    }
    if (this.srcPath === path) return;
    this.srcPath = path;
    const dense = densifyPath(path, DENSIFY_MAX_M);
    this.path = dense;
    this.cum = [0];
    for (let i = 1; i < dense.length; i++) {
      this.cum.push(this.cum[i - 1] + haversineM(dense[i - 1], dense[i]));
    }
    this.pathTotal = this.cum[this.cum.length - 1];
    const snap = snapAlong({ lat: this.curLat, lng: this.curLng }, dense, this.cum);
    if (snap) {
      this.displayedAlong = snap.along;
    }
    this.correctionVel = 0;
  }

  setTarget(lat: number, lng: number, bearing: number, nowMs: number, speedMps = 0) {
    this.toLat = lat;
    this.toLng = lng;
    this.toBearing = bearing;

    let estSpeed = speedMps;
    if (estSpeed <= 0.1 && this.lastPingMs > 0) {
      const dtSec = (nowMs - this.lastPingMs) / 1000;
      if (dtSec > 1 && dtSec < 120) {
        const d = haversineM({ lat: this.lastPingLat, lng: this.lastPingLng }, { lat, lng });
        estSpeed = Math.max(0, Math.min(22, d / dtSec));
      }
    }
    this.lastPingMs = nowMs;
    this.lastPingLat = lat;
    this.lastPingLng = lng;

    if (this.path && this.path.length >= 2) {
      const snap = snapAlong({ lat, lng }, this.path, this.cum);
      const tightOk = snap && snap.perpM <= MAX_SNAP_M;
      const looseOk = snap && snap.perpM <= PATH_ATTACH_M;

      if (tightOk || looseOk) {
        const pingAlong = snap!.along;
        const err = pingAlong - this.displayedAlong;

        if (Math.abs(err) > TELEPORT_M) {
          this.correctionVel = err / FAST_SETTLE_S;
        } else {
          this.correctionVel = err / SETTLE_S;
        }

        const weight = tightOk ? SPEED_SMOOTH : SPEED_SMOOTH * 0.4;
        this.speedMps =
          this.speedMps === 0 && estSpeed > 0
            ? estSpeed
            : this.speedMps * (1 - weight) + estSpeed * weight;

        this.usePath = true;
        this.boarding = this.speedMps < 0.5;
        return;
      }
      this.correctionVel = 0;
      this.speedMps *= 0.75;
      if (this.speedMps < 0.4) this.boarding = true;
      this.usePath = true;
      return;
    }

    this.usePath = false;
    this.fromLat = this.curLat;
    this.fromLng = this.curLng;
    this.fromBearing = this.currentBearing;
    const delta = ((bearing - this.currentBearing + 540) % 360) - 180;
    this.bearingDelta = delta;
    this.tweenStart = nowMs;

    const distM = haversineM({ lat: this.fromLat, lng: this.fromLng }, { lat, lng });
    if (estSpeed < 0.5 || distM < 3) {
      this.tweenDur = 1200;
      this.boarding = true;
    } else {
      const dur = (distM / estSpeed) * 1000;
      this.tweenDur = Math.max(1500, Math.min(22_000, dur));
      this.boarding = false;
    }
  }

  prime(lat: number, lng: number, bearing: number, nowMs: number, ts: number, speedMps = 0) {
    this.lastPingMs = nowMs;
    this.lastPingLat = lat;
    this.lastPingLng = lng;
    this.lastTs = ts;
    this.currentBearing = bearing;
    this.toBearing = bearing;
    if (this.path && this.path.length >= 2) {
      const snap = snapAlong({ lat, lng }, this.path, this.cum);
      if (snap && snap.perpM <= PATH_ATTACH_M) {
        this.displayedAlong = snap.along;
        const seededSpeed = Math.max(0, Math.min(22, speedMps));
        if (seededSpeed > 0.5) {
          this.speedMps = seededSpeed;
          this.usePath = true;
          this.boarding = false;
          return;
        }
      }
    }
    this.speedMps = Math.max(0, Math.min(22, speedMps));
    this.boarding = this.speedMps < 0.5;
  }

  tick(nowMs: number): KinematicState {
    if (this.lastTickMs === 0) this.lastTickMs = nowMs;
    const dt = Math.min(0.1, Math.max(0, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;

    let lat: number;
    let lng: number;
    let targetBearing: number | null = null;

    if (this.usePath && this.path) {
      this.displayedAlong += (this.speedMps + this.correctionVel) * dt;
      this.displayedAlong = Math.max(0, Math.min(this.pathTotal, this.displayedAlong));
      this.correctionVel *= Math.exp(-dt / CORRECTION_TAU);
      if (Math.abs(this.correctionVel) < 0.01) this.correctionVel = 0;

      const sample = sampleAlong(this.path, this.cum, this.displayedAlong);
      lat = sample.lat;
      lng = sample.lng;
      targetBearing = sample.bearing;
    } else {
      const t = Math.min(1, (nowMs - this.tweenStart) / this.tweenDur);
      const e = EASE(t);
      lat = lerp(this.fromLat, this.toLat, e);
      lng = lerp(this.fromLng, this.toLng, e);
      targetBearing = this.fromBearing + this.bearingDelta * e;
      if (t >= 1) {
        this.fromLat = this.toLat;
        this.fromLng = this.toLng;
        this.fromBearing = this.toBearing;
        this.bearingDelta = 0;
      }
    }

    if (targetBearing != null) {
      const diff = ((targetBearing - this.currentBearing + 540) % 360) - 180;
      const k = Math.min(1, dt * BEARING_SLEW_PER_S);
      this.currentBearing = (this.currentBearing + diff * k + 360) % 360;
    }

    this.curLat = lat;
    this.curLng = lng;

    return {
      lat: this.curLat,
      lng: this.curLng,
      bearing: this.currentBearing,
      boarding: this.boarding,
    };
  }

  isBoarding() {
    return this.boarding;
  }

  getPos() {
    return { lat: this.curLat, lng: this.curLng };
  }

  getLastTs() {
    return this.lastTs;
  }

  setLastTs(ts: number) {
    this.lastTs = ts;
  }

  getDebug(nowMs: number): KinematicDebugSnapshot {
    const pingAgeMs = this.lastPingMs > 0 ? Math.max(0, nowMs - this.lastPingMs) : -1;
    return {
      lat: this.curLat,
      lng: this.curLng,
      bearing: this.currentBearing,
      speedMps: this.speedMps,
      speedKmh: this.speedMps * 3.6,
      pingAgeMs,
      mode: this.usePath ? "path" : "lerp",
      hasPath: !!this.path,
      pathTotalM: this.pathTotal,
      alongM: this.displayedAlong,
      correctionVel: this.correctionVel,
      boarding: this.boarding,
    };
  }
}
