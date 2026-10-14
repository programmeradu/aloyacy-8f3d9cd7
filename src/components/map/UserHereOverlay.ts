import type mapboxgl from "mapbox-gl";
import type { MapboxApi } from "@/lib/useMapbox";

/* ============================================================
 * UserHereOverlay: the classic "blue dot" for the rider's
 * own location, with an optional translucent heading cone when a
 * compass or GPS heading is available. Lightweight DOM overlay so
 * it composites smoothly with the gliding bus markers.
 * ============================================================ */
export class UserHereOverlay {
  private marker: mapboxgl.Marker;
  private onZoom: () => void;
  private el: HTMLDivElement;
  private cone: HTMLDivElement;
  private accuracyHalo: HTMLDivElement;
  private map: mapboxgl.Map;
  private lat: number;
  private lng: number;
  private heading: number | null;
  private accuracyM: number;

  constructor(
    api: MapboxApi,
    map: mapboxgl.Map,
    init: { lat: number; lng: number; headingDeg?: number | null; accuracyM?: number },
  ) {
    this.lat = init.lat;
    this.lng = init.lng;
    this.heading = init.headingDeg ?? null;
    this.accuracyM = init.accuracyM ?? 25;
    ensureUserHerePulseKeyframes();

    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.pointerEvents = "none";
    el.style.willChange = "transform";
    el.style.transformOrigin = "center center";

    // Accuracy halo — soft fill scaled by GPS accuracy.
    const accuracyHalo = document.createElement("div");
    accuracyHalo.style.position = "absolute";
    accuracyHalo.style.left = "50%";
    accuracyHalo.style.top = "50%";
    accuracyHalo.style.borderRadius = "50%";
    accuracyHalo.style.background =
      "radial-gradient(circle, color-mix(in oklab, #2d8a9e 22%, transparent) 0%, color-mix(in oklab, #2d8a9e 8%, transparent) 60%, transparent 100%)";
    accuracyHalo.style.transform = "translate(-50%, -50%)";

    // Heading cone — SVG wedge so it renders crisply across engines and is
    // never killed by mask-image quirks. Points "up" (north); the outer
    // <div> rotates by the heading. A subtle gradient fades the tip out so
    // it reads as direction-of-travel, not a hard cone.
    const cone = document.createElement("div");
    cone.style.position = "absolute";
    cone.style.left = "50%";
    cone.style.top = "50%";
    cone.style.width = "64px";
    cone.style.height = "64px";
    cone.style.transformOrigin = "50% 50%";
    cone.style.transform = "translate(-50%, -50%) rotate(0deg)";
    cone.style.opacity = this.heading == null ? "0" : "1";
    cone.style.transition = "opacity 240ms ease, transform 320ms ease";
    cone.innerHTML = `
      <svg viewBox="0 0 64 64" width="64" height="64" style="display:block;">
        <defs>
          <linearGradient id="aloya-cone-grad" x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stop-color="#2d8a9e" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="#2d8a9e" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="M32 32 L24 10 Q32 6 40 10 Z" fill="url(#aloya-cone-grad)"/>
      </svg>
    `;

    // Pulsing soft outer ring.
    const pulse = document.createElement("div");
    pulse.style.position = "absolute";
    pulse.style.left = "50%";
    pulse.style.top = "50%";
    pulse.style.width = "22px";
    pulse.style.height = "22px";
    pulse.style.borderRadius = "50%";
    pulse.style.transform = "translate(-50%, -50%)";
    pulse.style.background = "color-mix(in oklab, #2d8a9e 30%, transparent)";
    pulse.style.animation = "aloya-here-pulse 1800ms ease-out infinite";

    // Core dot — white ring + aegean center, classic "you" marker.
    const dot = document.createElement("div");
    dot.style.position = "absolute";
    dot.style.left = "50%";
    dot.style.top = "50%";
    dot.style.width = "12px";
    dot.style.height = "12px";
    dot.style.borderRadius = "50%";
    dot.style.transform = "translate(-50%, -50%)";
    dot.style.background = "#2d8a9e";
    dot.style.border = "2px solid #ffffff";
    dot.style.boxShadow = "0 1px 4px rgba(20,20,20,0.35)";

    el.appendChild(accuracyHalo);
    el.appendChild(cone);
    el.appendChild(pulse);
    el.appendChild(dot);

    this.el = el;
    this.cone = cone;
    this.accuracyHalo = accuracyHalo;
    this.applyAccuracy(map);
    this.applyHeading();

    this.map = map;
    this.marker = new api.Marker({ element: el, anchor: "center" })
      .setLngLat([this.lng, this.lat])
      .addTo(map);
    this.onZoom = () => this.applyAccuracy(this.map);
    map.on("zoom", this.onZoom);
  }

  update(next: { lat: number; lng: number; headingDeg?: number | null; accuracyM?: number }) {
    this.lat = next.lat;
    this.lng = next.lng;
    this.heading = next.headingDeg ?? null;
    this.accuracyM = next.accuracyM ?? this.accuracyM;
    this.applyHeading();
    this.marker.setLngLat([this.lng, this.lat]);
    this.applyAccuracy(this.map);
  }

  private applyHeading() {
    if (this.heading == null) {
      this.cone.style.opacity = "0";
    } else {
      this.cone.style.opacity = "1";
      this.cone.style.transform = `translate(-50%, -50%) rotate(${this.heading}deg)`;
    }
  }

  private applyAccuracy(map: mapboxgl.Map) {
    // Convert accuracy in metres to pixels at current zoom (512px tiles).
    const zoom = map.getZoom() ?? 13;
    const scale = 2 ** zoom;
    const metersPerPixel = (78271.517 * Math.cos((this.lat * Math.PI) / 180)) / scale;
    const px = Math.max(24, Math.min(160, this.accuracyM / metersPerPixel));
    this.accuracyHalo.style.width = `${px * 2}px`;
    this.accuracyHalo.style.height = `${px * 2}px`;
  }

  destroy() {
    this.map.off("zoom", this.onZoom);
    this.marker.remove();
  }
}

let userHerePulseKeyframesInjected = false;
function ensureUserHerePulseKeyframes() {
  if (userHerePulseKeyframesInjected || typeof document === "undefined") return;
  userHerePulseKeyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `@keyframes aloya-here-pulse {
    0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0.6; }
    80%  { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
    100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
  }`;
  document.head.appendChild(style);
}
