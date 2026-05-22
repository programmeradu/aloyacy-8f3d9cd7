/// <reference types="google.maps" />
import { useEffect, useMemo, useRef } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { useGoogleMaps, ALOYA_MAP_STYLE } from "@/lib/useGoogleMaps";
import busPremium from "@/assets/bus-premium.png";

export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  tone?: "aegean" | "ochre" | "olive" | "ink";
  kind?: "origin" | "destination" | "stop" | "pin";
};

type Props = {
  height?: string;
  center?: { lat: number; lng: number };
  /** Approximate viewport span in km. Used as fallback zoom when no bounds. */
  spanKm?: number;
  /** Encoded polyline (Google polyline algorithm). */
  polyline?: string;
  markers?: MapMarker[];
  /** If true, overlays realtime bus vehicles. Defaults to true. */
  liveVehicles?: boolean;
  /** If set, only the bus matching this tripId is shown (with active styling).
   *  Falls back to routeId match when no tripId matches the feed snapshot. */
  focusTripId?: string;
  focusRouteId?: string;
  /** If set, only render live vehicles whose tripId is in this list.
   *  Use to restrict the map to the buses relevant to a given stop/route. */
  restrictTripIds?: string[];
  /** Override the bottom-left live-count pill label. */
  liveLabel?: { active?: string; empty?: string };
  /** Fit map to markers + polyline. Defaults to true when any are provided. */
  fitToContent?: boolean;
};

const TONE_COLOR: Record<NonNullable<MapMarker["tone"]>, string> = {
  aegean: "#2d8a9e",
  ochre: "#d99645",
  olive: "#7d9b76",
  ink: "#2a261f",
};

function dot(color: string, size = 11, ring = 3): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: ring,
    scale: size / 2,
  };
}

function spanToZoom(spanKm: number) {
  // Rough mercator-ish: zoom 12 ~ 8km span at Nicosia latitude
  const z = Math.round(12 - Math.log2(spanKm / 8));
  return Math.max(6, Math.min(17, z));
}

export function MapPreview({
  height = "h-64",
  center = NICOSIA_CENTER,
  spanKm = 8,
  polyline,
  markers,
  liveVehicles = true,
  focusTripId,
  focusRouteId,
  restrictTripIds,
  liveLabel,
  fitToContent,
}: Props) {
  const { api, error } = useGoogleMaps();
  const { data: rt } = useRealtime();
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const layerRef = useRef<{
    polyline?: google.maps.Polyline;
    markers: google.maps.Marker[];
  }>({ markers: [] });
  // Per-vehicle OverlayView state lives outside React so animation can keep
  // tweening smoothly between feed refreshes without rerendering.
  const busLayerRef = useRef<Map<string, AnimatedBus>>(new Map());
  const rafRef = useRef<number | null>(null);

  // Initialize map once API is ready
  useEffect(() => {
    if (!api || !elRef.current || mapRef.current) return;
    mapRef.current = new api.maps.Map(elRef.current, {
      center,
      zoom: spanToZoom(spanKm),
      disableDefaultUI: true,
      gestureHandling: "greedy",
      backgroundColor: "#f3ede1",
      styles: ALOYA_MAP_STYLE,
      clickableIcons: false,
    });
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update center / zoom when no fit content is needed
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const hasContent =
      (polyline && polyline.length > 0) ||
      (markers && markers.length > 0);
    const shouldFit = fitToContent ?? hasContent;
    if (!shouldFit) {
      m.setCenter(center);
      m.setZoom(spanToZoom(spanKm));
    }
  }, [center.lat, center.lng, spanKm, polyline, markers, fitToContent]);

  // Draw polyline + markers
  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    const layer = layerRef.current;

    layer.polyline?.setMap(null);
    layer.markers.forEach((mk) => mk.setMap(null));
    layer.markers = [];

    const bounds = new api.maps.LatLngBounds();
    let hasBounds = false;

    if (polyline) {
      const path = api.maps.geometry.encoding.decodePath(polyline);
      layer.polyline = new api.maps.Polyline({
        path,
        strokeColor: "#1c5566",
        strokeOpacity: 0.95,
        strokeWeight: 4,
        map: m,
      });
      path.forEach((p) => {
        bounds.extend(p);
        hasBounds = true;
      });
    }

    (markers ?? []).forEach((mk) => {
      const color = TONE_COLOR[mk.tone ?? "aegean"];
      const marker = new api.maps.Marker({
        position: { lat: mk.lat, lng: mk.lng },
        map: m,
        title: mk.label,
        icon:
          mk.kind === "origin"
            ? dot("#2a261f", 14, 3)
            : mk.kind === "destination"
              ? dot("#d99645", 14, 3)
              : dot(color, 11, 3),
        zIndex: mk.kind === "origin" || mk.kind === "destination" ? 100 : 50,
      });
      layer.markers.push(marker);
      bounds.extend(marker.getPosition()!);
      hasBounds = true;
    });

    const shouldFit = fitToContent ?? hasBounds;
    if (shouldFit && hasBounds) {
      m.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    }
  }, [api, polyline, JSON.stringify(markers), fitToContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime vehicles overlay. When focused on a single trip, only that bus
  // is rendered (and rendered prominently) — the rest of the fleet is hidden.
  const allVehicles = liveVehicles ? rt?.vehicles : undefined;
  const restrictKey = restrictTripIds ? restrictTripIds.join(",") : "";
  const vehicles = useMemo(() => {
    if (!allVehicles) return undefined;
    if (focusTripId || focusRouteId) {
      const byTrip = focusTripId ? allVehicles.filter((v) => v.tripId === focusTripId) : [];
      if (byTrip.length) return byTrip;
      if (focusRouteId) return allVehicles.filter((v) => v.routeId === focusRouteId);
      return [];
    }
    if (restrictTripIds && restrictTripIds.length) {
      const set = new Set(restrictTripIds);
      return allVehicles.filter((v) => set.has(v.tripId));
    }
    return allVehicles;
  }, [allVehicles, focusTripId, focusRouteId, restrictKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const focused = !!(focusTripId || focusRouteId);
  const restricted = !focused && !!(restrictTripIds && restrictTripIds.length);

  // -------------------------------------------------------------------
  // Premium gliding bus overlay. Each vehicle is its own DOM overlay that
  // tweens position + bearing between feed refreshes (rAF every frame),
  // giving the Uber-style smooth glide instead of teleporting on each poll.
  // -------------------------------------------------------------------
  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;

    const layer = busLayerRef.current;
    const now = performance.now();

    if (!vehicles) {
      // Clear all buses when source goes away (e.g. liveVehicles=false).
      layer.forEach((b) => b.destroy());
      layer.clear();
      return;
    }

    const seen = new Set<string>();
    const sliceLimit = focused ? 1 : 40;
    const slice = vehicles.slice(0, sliceLimit);
    const sizePx = focused ? 64 : restricted ? 56 : 44;

    for (const v of slice) {
      seen.add(v.id);
      const existing = layer.get(v.id);
      const targetLat = v.lat;
      const targetLng = v.lng;
      const targetBearing = v.bearing ?? 0;

      if (existing) {
        existing.setTarget(targetLat, targetLng, targetBearing, now);
        existing.setSize(sizePx);
        existing.setFocused(focused);
      } else {
        const bus = new AnimatedBus(
          api,
          m,
          { lat: targetLat, lng: targetLng },
          targetBearing,
          sizePx,
          focused,
          v.label || `Bus ${v.id}`,
        );
        layer.set(v.id, bus);
      }
    }

    // Remove buses no longer in the feed.
    for (const [id, bus] of layer) {
      if (!seen.has(id)) {
        bus.destroy();
        layer.delete(id);
      }
    }

    // Drive the animation loop while we have any bus.
    if (rafRef.current == null && layer.size > 0) {
      const tick = (t: number) => {
        const m2 = mapRef.current;
        if (!m2 || busLayerRef.current.size === 0) {
          rafRef.current = null;
          return;
        }
        busLayerRef.current.forEach((b) => b.tick(t));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [api, vehicles, focused, restricted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      busLayerRef.current.forEach((b) => b.destroy());
      busLayerRef.current.clear();
    };
  }, []);

  const liveCount = focused || restricted ? vehicles?.length ?? 0 : rt?.vehicles.length ?? 0;
  const placeLabel = useMemo(() => {
    // Sub-degree → meters; round to avoid janky decimals.
    const km = spanKm;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
  }, [spanKm]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[28px] ring-1 ring-line bg-limestone-soft ${height}`}
    >
      <div ref={elRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Map unavailable
          </p>
        </div>
      )}
      {liveVehicles && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md ring-1 ring-line">
          <span className="size-1.5 rounded-full bg-aegean-deep animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink">
            {focused
              ? liveCount
                ? "Your bus — live"
                : "Locating your bus"
              : restricted
                ? liveCount
                  ? liveLabel?.active ?? `${liveCount} serving · live`
                  : liveLabel?.empty ?? "No buses here right now"
                : liveCount
                  ? `${liveCount} live`
                  : "Connecting"}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        Cyprus &nbsp;·&nbsp; {placeLabel}
      </div>
    </div>
  );
}

/* ============================================================
 * AnimatedBus — a Google Maps OverlayView that renders a premium
 * top-down bus image and tweens its position + bearing smoothly
 * between live feed updates (~20s refresh). Uses CSS transforms
 * so movement is GPU-accelerated, with shortest-arc rotation.
 * ============================================================ */
const TWEEN_MS = 5500; // feed updates roughly every 20s; tween across most of it
const EASE = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

class AnimatedBus {
  private api: typeof google;
  private map: google.maps.Map;
  private label: string;
  private size: number;
  private focused: boolean;

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

  // overlay
  private overlay: google.maps.OverlayView;
  private el: HTMLDivElement;
  private img: HTMLImageElement;
  private glow: HTMLDivElement;

  constructor(
    api: typeof google,
    map: google.maps.Map,
    pos: { lat: number; lng: number },
    bearing: number,
    size: number,
    focused: boolean,
    label: string,
  ) {
    this.api = api;
    this.map = map;
    this.label = label;
    this.size = size;
    this.focused = focused;
    this.fromLat = this.toLat = pos.lat;
    this.fromLng = this.toLng = pos.lng;
    this.fromBearing = this.toBearing = bearing;
    this.currentBearing = bearing;

    // Build DOM
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.willChange = "transform";
    el.style.pointerEvents = "none";
    el.style.transformOrigin = "center center";
    el.title = label;

    const glow = document.createElement("div");
    glow.style.position = "absolute";
    glow.style.inset = "0";
    glow.style.borderRadius = "50%";
    glow.style.background =
      "radial-gradient(circle, color-mix(in oklab, #d99645 35%, transparent) 0%, transparent 65%)";
    glow.style.opacity = focused ? "0.95" : "0";
    glow.style.transition = "opacity 240ms ease";
    glow.style.transform = "scale(1.6)";

    const img = document.createElement("img");
    img.src = busPremium;
    img.alt = "";
    img.draggable = false;
    img.style.position = "absolute";
    img.style.inset = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.filter = focused
      ? "drop-shadow(0 6px 10px rgba(20,20,20,0.35))"
      : "drop-shadow(0 3px 6px rgba(20,20,20,0.28))";
    img.style.transition = "filter 240ms ease";

    el.appendChild(glow);
    el.appendChild(img);

    this.el = el;
    this.img = img;
    this.glow = glow;
    this.applySize();

    // Build OverlayView
    const self = this;
    class BusOverlay extends api.maps.OverlayView {
      onAdd() {
        const panes = this.getPanes();
        panes?.overlayMouseTarget.appendChild(self.el);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const pt = projection.fromLatLngToDivPixel(
          new api.maps.LatLng(self.fromLat, self.fromLng),
        );
        if (!pt) return;
        self.el.style.transform = `translate3d(${pt.x - self.size / 2}px, ${pt.y - self.size / 2}px, 0)`;
        self.img.style.transform = `rotate(${self.currentBearing}deg)`;
      }
      onRemove() {
        self.el.parentNode?.removeChild(self.el);
      }
    }
    this.overlay = new BusOverlay();
    this.overlay.setMap(map);
  }

  private applySize() {
    this.el.style.width = `${this.size}px`;
    this.el.style.height = `${this.size}px`;
    this.el.style.zIndex = String(this.focused ? 1200 : 1000);
  }

  setSize(size: number) {
    if (size === this.size) return;
    this.size = size;
    this.applySize();
  }

  setFocused(focused: boolean) {
    if (focused === this.focused) return;
    this.focused = focused;
    this.glow.style.opacity = focused ? "0.95" : "0";
    this.img.style.filter = focused
      ? "drop-shadow(0 6px 10px rgba(20,20,20,0.35))"
      : "drop-shadow(0 3px 6px rgba(20,20,20,0.28))";
    this.applySize();
  }

  setTarget(lat: number, lng: number, bearing: number, nowMs: number) {
    // Snap "from" to wherever we currently are before starting the next tween.
    this.fromLat = this.toLat;
    this.fromLng = this.toLng;
    this.fromBearing = this.currentBearing;
    this.toLat = lat;
    this.toLng = lng;
    this.toBearing = bearing;
    // shortest-arc delta in [-180, 180]
    let delta = ((bearing - this.currentBearing + 540) % 360) - 180;
    this.bearingDelta = delta;
    this.tweenStart = nowMs;
  }

  tick(nowMs: number) {
    const t = Math.min(1, (nowMs - this.tweenStart) / this.tweenDur);
    const e = EASE(t);
    this.fromLat = this.fromLat + (this.toLat - this.fromLat) * e * 0; // no-op safety
    const lat = lerp(this.fromLat, this.toLat, e);
    const lng = lerp(this.fromLng, this.toLng, e);
    // we don't mutate from* mid-tween — instead recompute lerp using stored start values
    // store interpolated point back into from* only when tween completes
    const projection = this.overlay.getProjection();
    if (!projection) return;
    const pt = projection.fromLatLngToDivPixel(new this.api.maps.LatLng(lat, lng));
    if (!pt) return;
    this.currentBearing = this.fromBearing + this.bearingDelta * e;
    this.el.style.transform = `translate3d(${pt.x - this.size / 2}px, ${pt.y - this.size / 2}px, 0)`;
    this.img.style.transform = `rotate(${this.currentBearing}deg)`;
    if (t >= 1) {
      this.fromLat = this.toLat;
      this.fromLng = this.toLng;
      this.fromBearing = this.toBearing;
      this.bearingDelta = 0;
    }
  }

  destroy() {
    this.overlay.setMap(null);
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
