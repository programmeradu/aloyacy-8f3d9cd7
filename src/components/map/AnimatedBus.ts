/// <reference types="google.maps" />
// AnimatedBus — Google Maps overlay that glides a live bus between feed
// pings. Split out of MapPreview so the component stays presentational and
// the kinematic model can evolve on its own in ./kinematic-engine.

import { createBusElements, renderBusVariant } from "./bus-dom";
import { KinematicBusEngine } from "./kinematic-engine";

export class AnimatedBus {
  private api: typeof google;
  private map: google.maps.Map;
  private label: string;
  private size: number;
  private focused: boolean;
  private variant: "premium" | "triangle";
  private stale = false;

  // Kinematic state engine (dead-reckoning, polyline snapping, tweening)
  private engine: KinematicBusEngine;

  // overlay
  private overlay: google.maps.OverlayView;
  private el: HTMLDivElement;
  private rotor: HTMLDivElement; // the element we rotate (img or svg)
  private halo: HTMLDivElement; // freshness ring shown when ping is stale
  private boardingRing: HTMLDivElement; // pulsing ring when bus is stopped at a stop

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

    this.engine = new KinematicBusEngine(pos, bearing);

    // DOM scaffold (element, freshness halo, boarding ring, rotor) lives in ./bus-dom
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
    // Google's OverlayView subclass rebinds `this`; capture the marker instance.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    class BusOverlay extends api.maps.OverlayView {
      onAdd() {
        const panes = this.getPanes();
        panes?.overlayMouseTarget.appendChild(self.el);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const pos = self.engine.getPos();
        const pt = projection.fromLatLngToDivPixel(new api.maps.LatLng(pos.lat, pos.lng));
        if (!pt) return;
        self.el.style.transform = `translate3d(${pt.x - self.size / 2}px, ${pt.y - self.size / 2}px, 0)`;
        self.rotor.style.transform = `rotate(${self.engine.getDebug(performance.now()).bearing}deg)`;
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

  setPath(path: { lat: number; lng: number }[] | null) {
    this.engine.setPath(path);
  }

  setTarget(lat: number, lng: number, bearing: number, nowMs: number, speedMps = 0) {
    this.engine.setTarget(lat, lng, bearing, nowMs, speedMps);
    this.syncBoarding();
  }

  private syncBoarding() {
    const on = this.engine.isBoarding();
    this.boardingRing.style.opacity = on ? "1" : "0";
    this.boardingRing.style.animation = on ? "aloya-board-pulse 1600ms ease-out infinite" : "none";
  }

  isBoarding() {
    return this.engine.isBoarding();
  }

  getPos() {
    return this.engine.getPos();
  }

  getLastTs() {
    return this.engine.getLastTs();
  }

  setLastTs(ts: number) {
    this.engine.setLastTs(ts);
  }

  prime(lat: number, lng: number, bearing: number, nowMs: number, ts: number, speedMps = 0) {
    this.engine.prime(lat, lng, bearing, nowMs, ts, speedMps);
    this.syncBoarding();
  }

  getDebug(nowMs: number) {
    return {
      label: this.label,
      stale: this.stale,
      ...this.engine.getDebug(nowMs),
    };
  }

  tick(nowMs: number) {
    const state = this.engine.tick(nowMs);
    this.syncBoarding();

    const projection = this.overlay.getProjection();
    if (!projection) return;
    const pt = projection.fromLatLngToDivPixel(new this.api.maps.LatLng(state.lat, state.lng));
    if (!pt) return;
    this.el.style.transform = `translate3d(${pt.x - this.size / 2}px, ${pt.y - this.size / 2}px, 0)`;
    this.rotor.style.transform = `rotate(${state.bearing}deg)`;
  }

  destroy() {
    this.overlay.setMap(null);
  }
}
