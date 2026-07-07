/// <reference types="google.maps" />
// AnimatedBus — Google Maps overlay that glides a live bus between feed
// pings. Split out of MapPreview so the component stays presentational and
// the kinematic model can evolve on its own. Pure path math lives in
// @aloya/core/path-geometry.

import { createBusElements, renderBusVariant } from "./bus-dom";
import { distanceM as haversineM } from "@aloya/core/geo";
import { densifyPath, lerp, sampleAlong, snapAlong } from "@aloya/core/path-geometry";

/* ============================================================
 * AnimatedBus — a Google Maps OverlayView that renders a premium
 * top-down bus image and glides it smoothly between live feed
 * updates (~20 s refresh). For trips with a known shape polyline
 * we run a small kinematic model — dead-reckon along the line at
 * the smoothed feed speed, then bleed off prediction error when a
 * new ping arrives — so the marker behaves like Uber/Lyft instead
 * of teleporting on every refresh. Off-path buses fall back to a
 * straight ease-tween between pings.
 * ============================================================ */
const TWEEN_MS = 5500; // off-path fallback tween length
const MAX_SNAP_M = 90; // accept pings within this of the polyline (urban GPS noise)
const PATH_ATTACH_M = 180; // even noisier pings still snap to path if one exists
const TELEPORT_M = 400; // above this prediction error, fast-settle instead of bleed
const SETTLE_S = 1.5; // target time to absorb a normal prediction error
const FAST_SETTLE_S = 0.4; // settle time for large jumps (replaces hard snap)
const CORRECTION_TAU = 0.6; // exp-decay constant for the correction velocity
const DENSIFY_MAX_M = 25; // max segment length after densification
const SPEED_SMOOTH = 0.55; // EMA weight on the freshest speed sample
const BEARING_SLEW_PER_S = 6; // radians-equivalent slew rate for bearing follow
const EASE = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

export class AnimatedBus {
  private api: typeof google;
  private map: google.maps.Map;
  private label: string;
  private size: number;
  private focused: boolean;
  private variant: "premium" | "triangle";
  private stale = false;

  // tween state
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

  // polyline glide — kinematic model
  // We hold the densified path + cumulative-distance index. `srcPath` is the
  // un-densified reference we received, kept only so setPath() can no-op when
  // the upstream shape hasn't changed.
  private srcPath: { lat: number; lng: number }[] | null = null;
  private path: { lat: number; lng: number }[] | null = null;
  private cum: number[] = [];
  private pathTotal = 0;
  // Current rendered position along the path, in metres. Advanced every frame
  // by speed + correction velocity, then sampled to lat/lng.
  private displayedAlong = 0;
  // Smoothed ground speed (m/s), EMA-blended from feed pings.
  private speedMps = 0;
  // Last ping snapshot — used to derive ground speed when the feed itself
  // reports speed = 0 (common for the Cyprus GTFS-RT feed). Without this
  // the kinematic model parks the bus between pings and then has to catch
  // up in one tween, which reads as a 20-second teleport.
  private lastPingMs = 0;
  private lastPingLat = 0;
  private lastPingLng = 0;
  // Upstream feed timestamp of the last ping we actually consumed. Used to
  // dedupe replayed pings: when the client refetches every 20s but the
  // upstream feed only updates every 30s, ~1 in 3 polls returns the SAME
  // ping. Without this guard, setTarget() would recompute err against the
  // already-advanced displayedAlong and visibly reverse the bus.
  private lastTs = 0;
  // Extra m/s added to dead-reckoning to bleed off a prediction error from
  // the most recent ping. Decays exponentially toward zero.
  private correctionVel = 0;
  private lastTickMs = 0;
  private usePath = false;

  // overlay
  private overlay: google.maps.OverlayView;
  private el: HTMLDivElement;
  private rotor: HTMLDivElement; // the element we rotate (img or svg)
  private halo: HTMLDivElement; // freshness ring shown when ping is stale
  private boardingRing: HTMLDivElement; // pulsing ring when bus is stopped at a stop
  private boarding = false;
  // current rendered position (used by stop-pulse detection)
  private curLat: number;
  private curLng: number;

  constructor(
    api: typeof google,
    map: google.maps.Map,
    pos: { lat: number; lng: number },
    bearing: number,
    size: number,
    focused: boolean,
    label: string,
    variant: "premium" | "triangle" = "premium",
    path: { lat: number; lng: number }[] | null = null,
    stale = false,
    _speedMps = 0,
  ) {
    this.api = api;
    this.map = map;
    this.label = label;
    this.size = size;
    this.focused = focused;
    this.variant = variant;
    this.stale = stale;
    this.fromLat = this.toLat = pos.lat;
    this.fromLng = this.toLng = pos.lng;
    this.fromBearing = this.toBearing = bearing;
    this.currentBearing = bearing;
    this.curLat = pos.lat;
    this.curLng = pos.lng;

    // DOM scaffold (element, freshness halo, boarding ring, rotor) lives in
    // ./bus-dom so this class stays focused on motion.
    const { el, halo, boardingRing, rotor } = createBusElements(label);

    this.el = el;
    this.halo = halo;
    this.boardingRing = boardingRing;
    this.rotor = rotor;
    this.renderVariant();
    this.applySize();
    this.applyStale();
    this.setPath(path);

    // Build OverlayView
    // Google's OverlayView subclass rebinds `this`; capture the marker
    // instance so the overlay callbacks can reach it.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    class BusOverlay extends api.maps.OverlayView {
      onAdd() {
        const panes = this.getPanes();
        panes?.overlayMouseTarget.appendChild(self.el);
      }
      draw() {
        // Render at the currently-animated position, NOT the last ping's
        // origin. Without this, every Maps pan/zoom/idle event resets the
        // bus to fromLat/fromLng and the next rAF frame snaps it forward —
        // a visible hop on every gesture.
        const projection = this.getProjection();
        if (!projection) return;
        const pt = projection.fromLatLngToDivPixel(new api.maps.LatLng(self.curLat, self.curLng));
        if (!pt) return;
        self.el.style.transform = `translate3d(${pt.x - self.size / 2}px, ${pt.y - self.size / 2}px, 0)`;
        self.rotor.style.transform = `rotate(${self.currentBearing}deg)`;
      }
      onRemove() {
        self.el.parentNode?.removeChild(self.el);
      }
    }
    this.overlay = new BusOverlay();
    this.overlay.setMap(map);
  }

  private renderVariant() {
    renderBusVariant(this.rotor, this.variant, this.focused);
  }

  private applySize() {
    this.el.style.width = `${this.size}px`;
    this.el.style.height = `${this.size}px`;
    this.el.style.zIndex = String(this.focused ? 1200 : this.variant === "premium" ? 1000 : 900);
  }

  private applyStale() {
    this.halo.style.opacity = this.stale ? "1" : "0";
    this.rotor.style.filter = this.stale ? "grayscale(0.35) opacity(0.7)" : "";
  }

  setSize(size: number) {
    if (size === this.size) return;
    this.size = size;
    this.applySize();
  }

  setVariant(variant: "premium" | "triangle") {
    if (variant === this.variant) return;
    this.variant = variant;
    this.renderVariant();
    this.applySize();
    this.applyStale();
  }

  setFocused(focused: boolean) {
    if (focused === this.focused) return;
    this.focused = focused;
    if (this.variant === "premium") this.renderVariant();
    this.applySize();
    this.applyStale();
  }

  setStale(stale: boolean) {
    if (stale === this.stale) return;
    this.stale = stale;
    this.applyStale();
  }

  /** Provide the trip's road-following polyline so we glide along it instead
   *  of straight-lerping through buildings. Pass null to revert to lerp.
   *  The path is densified to ≤25 m segments so curvature reads smoothly. */
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
    // Initialise the kinematic position from wherever we are right now,
    // so the first frame after path arrives doesn't snap to the start.
    // We always accept the nearest point on the polyline — even if the
    // perpendicular distance is large — so the bus never teleports to
    // along=0 just because GPS noise pushed it off the line.
    const snap = snapAlong({ lat: this.curLat, lng: this.curLng }, dense, this.cum);
    if (snap) {
      this.displayedAlong = snap.along;
    }
    this.correctionVel = 0;
  }

  /** Called whenever a fresh GTFS-RT ping lands for this vehicle.
   *  In path mode we treat the ping as a noisy observation: snap it to the
   *  polyline, reject it outright if it's too far off the line (urban GPS
   *  drift), or compute the prediction error and schedule a smooth bleed.
   *  In lerp mode we fall back to the original ease-tween. */
  setTarget(lat: number, lng: number, bearing: number, nowMs: number, speedMps = 0) {
    this.toLat = lat;
    this.toLng = lng;
    this.toBearing = bearing;

    // Derive ground speed from successive pings when the feed itself
    // doesn't supply one (Cyprus GTFS-RT often reports speed = 0).
    let estSpeed = speedMps;
    if (estSpeed <= 0.1 && this.lastPingMs > 0) {
      const dtSec = (nowMs - this.lastPingMs) / 1000;
      if (dtSec > 1 && dtSec < 120) {
        const d = haversineM({ lat: this.lastPingLat, lng: this.lastPingLng }, { lat, lng });
        // Clamp to a sane urban-bus envelope to ignore GPS jitter.
        estSpeed = Math.max(0, Math.min(22, d / dtSec));
      }
    }
    this.lastPingMs = nowMs;
    this.lastPingLat = lat;
    this.lastPingLng = lng;

    if (this.path && this.path.length >= 2) {
      const snap = snapAlong({ lat, lng }, this.path, this.cum);
      // Accept the snap if it's within the tight band (high-quality fix)
      // OR within the loose attach band when we already trust the path
      // (the path is more reliable than a noisy GPS sample). Either way
      // we stay on the polyline — never drop to cross-map lerp when a
      // path exists, since that's what draws lines through buildings.
      const tightOk = snap && snap.perpM <= MAX_SNAP_M;
      const looseOk = snap && snap.perpM <= PATH_ATTACH_M;

      if (tightOk || looseOk) {
        const pingAlong = snap!.along;
        const err = pingAlong - this.displayedAlong;

        if (Math.abs(err) > TELEPORT_M) {
          // Driver detoured, started a new run, or feed reset. Don't hard
          // snap (that's a visible teleport) — settle quickly instead.
          this.correctionVel = err / FAST_SETTLE_S;
        } else {
          // Smooth correction: distribute the error over SETTLE_S seconds.
          this.correctionVel = err / SETTLE_S;
        }

        // Trust speed more when the ping was on-path; less when it was loose.
        const weight = tightOk ? SPEED_SMOOTH : SPEED_SMOOTH * 0.4;
        this.speedMps =
          this.speedMps === 0 && estSpeed > 0
            ? estSpeed
            : this.speedMps * (1 - weight) + estSpeed * weight;

        this.usePath = true;
        this.setBoarding(this.speedMps < 0.5);
        return;
      }
      // Ping is wildly off the polyline (>PATH_ATTACH_M). Distrust the
      // sample entirely and keep gliding on the line with what we know.
      // Bleed correction; fade speed so the bus eventually parks if GPS
      // stays bad.
      this.correctionVel = 0;
      this.speedMps *= 0.75;
      if (this.speedMps < 0.4) this.setBoarding(true);
      this.usePath = true;
      return;
    }

    // -------- Off-path fallback (no shape available): ease-tween --------
    this.usePath = false;
    this.fromLat = this.curLat;
    this.fromLng = this.curLng;
    this.fromBearing = this.currentBearing;
    const delta = ((bearing - this.currentBearing + 540) % 360) - 180;
    this.bearingDelta = delta;
    this.tweenStart = nowMs;

    const distM = haversineM({ lat: this.fromLat, lng: this.fromLng }, { lat, lng });
    // Off-path: tween length = distance / speed, so the bus glides for the
    // full inter-ping interval instead of arriving early and parking.
    if (estSpeed < 0.5 || distM < 3) {
      this.tweenDur = 1200;
      this.setBoarding(true);
    } else {
      const dur = (distM / estSpeed) * 1000;
      this.tweenDur = Math.max(1500, Math.min(22_000, dur));
      this.setBoarding(false);
    }
  }

  private setBoarding(on: boolean) {
    if (on === this.boarding) return;
    this.boarding = on;
    this.boardingRing.style.opacity = on ? "1" : "0";
    this.boardingRing.style.animation = on ? "aloya-board-pulse 1600ms ease-out infinite" : "none";
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

  /** Record the first ping for a freshly created bus without committing it
   *  to lerp/boarding mode. Sets the speed-derivation baseline so the next
   *  real ping can compute distance/dt and immediately glide. */
  prime(lat: number, lng: number, bearing: number, nowMs: number, ts: number, speedMps = 0) {
    this.lastPingMs = nowMs;
    this.lastPingLat = lat;
    this.lastPingLng = lng;
    this.lastTs = ts;
    this.currentBearing = bearing;
    this.toBearing = bearing;
    // If we already have a path, snap our along-position so the next ping's
    // path branch starts from the right place instead of along=0.
    if (this.path && this.path.length >= 2) {
      const snap = snapAlong({ lat, lng }, this.path, this.cum);
      if (snap && snap.perpM <= PATH_ATTACH_M) {
        this.displayedAlong = snap.along;
        const seededSpeed = Math.max(0, Math.min(22, speedMps));
        if (seededSpeed > 0.5) {
          this.speedMps = seededSpeed;
          this.usePath = true;
          this.setBoarding(false);
          return;
        }
      }
    }
    this.speedMps = Math.max(0, Math.min(22, speedMps));
    this.setBoarding(this.speedMps < 0.5);
  }

  /** Telemetry snapshot used by the /qa stress-test overlay. */
  getDebug(nowMs: number) {
    const pingAgeMs = this.lastPingMs > 0 ? Math.max(0, nowMs - this.lastPingMs) : -1;
    return {
      label: this.label,
      lat: this.curLat,
      lng: this.curLng,
      bearing: this.currentBearing,
      speedMps: this.speedMps,
      speedKmh: this.speedMps * 3.6,
      pingAgeMs,
      mode: this.usePath ? ("path" as const) : ("lerp" as const),
      hasPath: !!this.path,
      pathTotalM: this.pathTotal,
      alongM: this.displayedAlong,
      correctionVel: this.correctionVel,
      boarding: this.boarding,
      stale: this.stale,
    };
  }

  tick(nowMs: number) {
    // Cap dt so a backgrounded tab doesn't fling the bus on resume.
    if (this.lastTickMs === 0) this.lastTickMs = nowMs;
    const dt = Math.min(0.1, Math.max(0, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;

    let lat: number;
    let lng: number;
    let targetBearing: number | null = null;

    if (this.usePath && this.path) {
      // Dead-reckon forward at the smoothed speed + any pending correction.
      this.displayedAlong += (this.speedMps + this.correctionVel) * dt;
      this.displayedAlong = Math.max(0, Math.min(this.pathTotal, this.displayedAlong));
      // Exponential decay on the correction velocity.
      this.correctionVel *= Math.exp(-dt / CORRECTION_TAU);
      if (Math.abs(this.correctionVel) < 0.01) this.correctionVel = 0;

      const sample = sampleAlong(this.path, this.cum, this.displayedAlong);
      lat = sample.lat;
      lng = sample.lng;
      targetBearing = sample.bearing;
    } else {
      // Off-path: original ease-tween.
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

    // Low-pass the bearing so tight turns sweep instead of snap.
    if (targetBearing != null) {
      const diff = ((targetBearing - this.currentBearing + 540) % 360) - 180;
      const k = Math.min(1, dt * BEARING_SLEW_PER_S);
      this.currentBearing = (this.currentBearing + diff * k + 360) % 360;
    }

    this.curLat = lat;
    this.curLng = lng;

    const projection = this.overlay.getProjection();
    if (!projection) return;
    const pt = projection.fromLatLngToDivPixel(new this.api.maps.LatLng(lat, lng));
    if (!pt) return;
    this.el.style.transform = `translate3d(${pt.x - this.size / 2}px, ${pt.y - this.size / 2}px, 0)`;
    this.rotor.style.transform = `rotate(${this.currentBearing}deg)`;
  }

  destroy() {
    this.overlay.setMap(null);
  }
}
