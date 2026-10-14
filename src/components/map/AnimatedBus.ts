// AnimatedBus: Mapbox GL marker that glides a live bus between feed
// pings. Split out of MapPreview so the component stays presentational and
// the kinematic model can evolve on its own in ./kinematic-engine.

import type mapboxgl from "mapbox-gl";
import type { MapboxApi } from "@/lib/useMapbox";
import { createBusElements, renderBusVariant } from "./bus-dom";
import { KinematicBusEngine } from "./kinematic-engine";

export class AnimatedBus {

  private label: string;
  private size: number;
  private focused: boolean;
  private variant: "premium" | "triangle";
  private stale = false;

  // Kinematic state engine (dead-reckoning, polyline snapping, tweening)
  private engine: KinematicBusEngine;

  // overlay
  private marker: mapboxgl.Marker;
  private el: HTMLDivElement;
  private rotor: HTMLDivElement; // the element we rotate (img or svg)
  private halo: HTMLDivElement; // freshness ring shown when ping is stale
  private boardingRing: HTMLDivElement; // pulsing ring when bus is stopped at a stop

  constructor(
    api: MapboxApi,
    map: mapboxgl.Map,
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

    // Mapbox owns the element's transform for positioning; we only rotate
    // the inner rotor, so the two never fight.
    this.marker = new api.Marker({ element: this.el, anchor: "center" })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
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
    this.marker.setLngLat([state.lng, state.lat]);
    this.rotor.style.transform = `rotate(${state.bearing}deg)`;
  }

  destroy() {
    this.marker.remove();
  }
}
