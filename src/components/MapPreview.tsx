/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER, getStop } from "@/lib/gtfs";
import { useGoogleMaps, ALOYA_MAP_STYLE } from "@/lib/useGoogleMaps";
import { prefetchShapes, getShapeForTripSync } from "@/lib/shapes";
import busPremium from "@/assets/bus-premium.png";
import { IconExpand, IconClose } from "@/components/Icons";

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
  /** Override the live position/bearing of specific vehicles by tripId.
   *  Used by the on-board journey to fuse the user's GPS into the bus blip
   *  so the marker glides with the rider's phone instead of the lagging feed. */
  vehicleOverrides?: Record<string, { lat: number; lng: number; bearing?: number }>;
  /** Override the bottom-left live-count pill label. */
  liveLabel?: { active?: string; empty?: string };
  /** Hide the bottom-left live-count pill (still renders vehicles). */
  hideLiveBadge?: boolean;
  /** Caption shown bottom-right. Defaults to "Cyprus — {spanKm}". */
  placeName?: string;
  /** Fit map to markers + polyline. Defaults to true when any are provided. */
  fitToContent?: boolean;
  /** Render a "you are here" dot (and optional heading cone) for the rider. */
  userLocation?: {
    lat: number;
    lng: number;
    /** Degrees clockwise from north. Null/undefined hides the cone. */
    headingDeg?: number | null;
    /** GPS accuracy in metres; used to size the soft accuracy halo. */
    accuracyM?: number;
  } | null;
  /** Show the expand-to-fullscreen toggle. Defaults to true. */
  fullscreenable?: boolean;
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
  vehicleOverrides,
  liveLabel,
  hideLiveBadge,
  placeName,
  fitToContent,
  userLocation,
  fullscreenable = true,
}: Props) {
  const [expanded, setExpanded] = useState(false);

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
  const userHereRef = useRef<UserHereOverlay | null>(null);

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
  const overrideKey = vehicleOverrides
    ? Object.entries(vehicleOverrides)
        .map(([k, v]) => `${k}:${v.lat.toFixed(5)},${v.lng.toFixed(5)},${Math.round(v.bearing ?? 0)}`)
        .join("|")
    : "";
  const vehicles = useMemo(() => {
    if (!allVehicles) return undefined;
    const apply = (list: typeof allVehicles) =>
      vehicleOverrides
        ? list.map((v) => {
            const o = vehicleOverrides[v.tripId];
            return o ? { ...v, lat: o.lat, lng: o.lng, bearing: o.bearing ?? v.bearing } : v;
          })
        : list;
    if (focusTripId || focusRouteId) {
      const byTrip = focusTripId ? allVehicles.filter((v) => v.tripId === focusTripId) : [];
      if (byTrip.length) return apply(byTrip);
      if (focusRouteId) return apply(allVehicles.filter((v) => v.routeId === focusRouteId));
      return [];
    }
    if (restrictTripIds && restrictTripIds.length) {
      const set = new Set(restrictTripIds);
      return apply(allVehicles.filter((v) => set.has(v.tripId)));
    }
    return apply(allVehicles);
  }, [allVehicles, focusTripId, focusRouteId, restrictKey, overrideKey]); // eslint-disable-line react-hooks/exhaustive-deps


  const focused = !!(focusTripId || focusRouteId);
  const restricted = !focused && !!(restrictTripIds && restrictTripIds.length);

  // -------------------------------------------------------------------
  // Per-trip path used to glide buses along the route. We prefer the real
  // GTFS shape polyline (follows roads), and fall back to a stop-derived
  // polyline (straight stop-to-stop lines, but still better than direct
  // ping-to-ping) when the shape isn't available for that trip.
  // -------------------------------------------------------------------
  useEffect(() => { prefetchShapes(); }, []);
  // Bump this state once the shape index finishes loading so the path
  // memo recomputes and switches buses from stop-fallback to real shape.
  const [shapesReady, setShapesReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getShapeForTrip } = await import("@/lib/shapes");
      // Touch any trip to ensure the index has loaded.
      await getShapeForTrip("__warmup__").catch(() => {});
      if (!cancelled) setShapesReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const tripPaths = useMemo(() => {
    const out = new Map<string, { lat: number; lng: number }[]>();
    if (!rt) return out;
    // 1) Real GTFS shapes per vehicle (if loaded).
    if (shapesReady) {
      for (const v of rt.vehicles) {
        const shape = getShapeForTripSync(v.tripId, v.routeId);
        if (shape) out.set(v.tripId, shape);
      }
    }
    // 2) Fallback: stop-derived polylines from arrivals.
    const byTrip = new Map<string, { stopId: string; t: number }[]>();
    for (const a of rt.arrivals) {
      const arr = byTrip.get(a.tripId) ?? [];
      arr.push({ stopId: a.stopId, t: a.arrivalUnix });
      byTrip.set(a.tripId, arr);
    }
    for (const [tripId, stops] of byTrip) {
      if (out.has(tripId)) continue; // real shape already wins
      stops.sort((x, y) => x.t - y.t);
      const poly: { lat: number; lng: number }[] = [];
      for (const s of stops) {
        const meta = getStop(s.stopId);
        if (meta) poly.push({ lat: meta.lat, lng: meta.lng });
      }
      if (poly.length >= 2) out.set(tripId, poly);
    }
    return out;
  }, [rt, shapesReady]);

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
    const nowSec = Math.floor(Date.now() / 1000);

    if (!vehicles) {
      // Clear all buses when source goes away (e.g. liveVehicles=false).
      layer.forEach((b) => b.destroy());
      layer.clear();
      return;
    }

    const seen = new Set<string>();
    const sliceLimit = focused ? 1 : 40;
    const slice = vehicles.slice(0, sliceLimit);
    const sizePx = focused ? 64 : restricted ? 48 : 16;
    // Premium top-down bus asset only for focused/restricted close-ups.
    // Wide fleet views (home, region overview) use lightweight directional
    // triangles so the map stays legible.
    const variant: "premium" | "triangle" = focused || restricted ? "premium" : "triangle";

    for (const v of slice) {
      seen.add(v.id);
      const existing = layer.get(v.id);
      const targetLat = v.lat;
      const targetLng = v.lng;
      const targetBearing = v.bearing ?? 0;
      const path = tripPaths.get(v.tripId) ?? null;
      const ageSec = v.timestamp ? Math.max(0, nowSec - v.timestamp) : 0;
      const stale = ageSec > 90;

      if (existing) {
        existing.setVariant(variant);
        existing.setPath(path);
        existing.setTarget(targetLat, targetLng, targetBearing, now, v.speed ?? 0);
        existing.setSize(sizePx);
        existing.setFocused(focused);
        existing.setStale(stale);
      } else {
        const bus = new AnimatedBus(
          api,
          m,
          { lat: targetLat, lng: targetLng },
          targetBearing,
          sizePx,
          focused,
          v.label || `Bus ${v.id}`,
          variant,
          path,
          stale,
          v.speed ?? 0,
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
        // Stop-pulse detection: any bus that's at-stop (speed≈0, near current
        // tween target) within ~30m of a rendered stop marker triggers a pulse
        // on that marker. Cheap O(buses × stops) — both are small.
        const stopMarkers = layerRef.current.markers;
        if (stopMarkers.length) {
          const active = new Set<google.maps.Marker>();
          busLayerRef.current.forEach((b) => {
            if (!b.isBoarding()) return;
            const pos = b.getPos();
            for (const mk of stopMarkers) {
              const p = mk.getPosition();
              if (!p) continue;
              if (haversineM(pos, { lat: p.lat(), lng: p.lng() }) < 30) active.add(mk);
            }
          });
          // Toggle a CSS class on each marker via icon scale tweak.
          for (const mk of stopMarkers) {
            const on = active.has(mk);
            const wasOn = (mk as unknown as { __pulse?: boolean }).__pulse;
            if (on === !!wasOn) continue;
            (mk as unknown as { __pulse?: boolean }).__pulse = on;
            const icon = mk.getIcon() as google.maps.Symbol | undefined;
            if (icon && typeof icon === "object" && "scale" in icon) {
              mk.setIcon({ ...icon, scale: on ? (icon.scale ?? 6) * 1.6 : (icon.scale ?? 6) / 1.6 });
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [api, vehicles, focused, restricted, tripPaths]);

  // ----- "You are here" overlay (rider's own location + heading cone) -----
  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    if (!userLocation) {
      userHereRef.current?.destroy();
      userHereRef.current = null;
      return;
    }
    if (!userHereRef.current) {
      userHereRef.current = new UserHereOverlay(api, m, userLocation);
    } else {
      userHereRef.current.update(userLocation);
    }
  }, [api, userLocation?.lat, userLocation?.lng, userLocation?.headingDeg, userLocation?.accuracyM]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger a Maps resize whenever the container size changes (fullscreen
  // toggle). Without this Google Maps caches the old bounds and renders blank
  // grey margins until the user pans.
  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    // next frame so the DOM has reflowed first
    const id = requestAnimationFrame(() => {
      const center = m.getCenter();
      api.maps.event.trigger(m, "resize");
      if (center) m.setCenter(center);
    });
    return () => cancelAnimationFrame(id);
  }, [api, expanded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      busLayerRef.current.forEach((b) => b.destroy());
      busLayerRef.current.clear();
      userHereRef.current?.destroy();
      userHereRef.current = null;
    };
  }, []);

  // Lock body scroll while in fullscreen.
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onEsc);
    };
  }, [expanded]);

  const liveCount = focused || restricted ? vehicles?.length ?? 0 : rt?.vehicles.length ?? 0;
  const placeLabel = useMemo(() => {
    // Sub-degree → meters; round to avoid janky decimals.
    const km = spanKm;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
  }, [spanKm]);

  const wrapperClass = expanded
    ? "fixed inset-0 z-50 w-full h-full rounded-none ring-0 bg-limestone-soft"
    : `relative w-full overflow-hidden rounded-[28px] ring-1 ring-line bg-limestone-soft ${height}`;

  return (
    <div className={`${wrapperClass} relative overflow-hidden`}>
      <div ref={elRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Map unavailable
          </p>
        </div>
      )}
      {liveVehicles && !hideLiveBadge && (
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 backdrop-blur-md ring-1 ring-line">
          <span className="size-1.5 rounded-full bg-aegean-deep animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink">
            {focused
              ? liveCount
                ? "Your bus — live"
                : "Locating your bus"
              : restricted
                ? liveCount
                  ? liveLabel?.active ?? `${liveCount} serving, live`
                  : liveLabel?.empty ?? "No buses here right now"
                : liveCount
                  ? `${liveCount} live`
                  : "Connecting"}
          </span>
        </div>
      )}
      {placeName && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {placeName}
        </div>
      )}
      {fullscreenable && !error && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Close fullscreen map" : "Expand map"}
          className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-white/90 backdrop-blur-md ring-1 ring-line text-ink shadow-sm transition-colors hover:bg-white"
        >
          {expanded ? <IconClose className="size-4" /> : <IconExpand className="size-4" />}
        </button>
      )}
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

  // polyline glide
  private path: { lat: number; lng: number }[] | null = null;
  // cumulative metres along path at each vertex — built lazily.
  private cum: number[] = [];
  // distance-along values for the current tween's from / to snap points.
  private fromAlong = 0;
  private toAlong = 0;
  private usePath = false;

  // overlay
  private overlay: google.maps.OverlayView;
  private el: HTMLDivElement;
  private rotor: HTMLDivElement; // the element we rotate (img or svg)
  private halo: HTMLDivElement;  // freshness ring shown when ping is stale
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
    speedMps = 0,
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

    // Build DOM
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.willChange = "transform";
    el.style.pointerEvents = "none";
    el.style.transformOrigin = "center center";
    el.title = label;

    const halo = document.createElement("div");
    halo.style.position = "absolute";
    halo.style.inset = "-18%";
    halo.style.borderRadius = "50%";
    halo.style.border = "2px solid color-mix(in oklab, #d99645 65%, transparent)";
    halo.style.background = "radial-gradient(circle, color-mix(in oklab, #d99645 18%, transparent) 0%, transparent 70%)";
    halo.style.opacity = "0";
    halo.style.transition = "opacity 240ms ease";
    halo.style.pointerEvents = "none";

    // Boarding ring — concentric pulse shown when the bus is stationary
    // at a stop (picking up / dropping off). Uses inline keyframes so we
    // don't have to inject CSS globally.
    ensureBoardingKeyframes();
    const boardingRing = document.createElement("div");
    boardingRing.style.position = "absolute";
    boardingRing.style.inset = "-35%";
    boardingRing.style.borderRadius = "50%";
    boardingRing.style.border = "2px solid color-mix(in oklab, #2d8a9e 80%, transparent)";
    boardingRing.style.opacity = "0";
    boardingRing.style.pointerEvents = "none";
    boardingRing.style.transformOrigin = "center center";

    const rotor = document.createElement("div");
    rotor.style.position = "absolute";
    rotor.style.inset = "0";
    rotor.style.width = "100%";
    rotor.style.height = "100%";
    rotor.style.transformOrigin = "center center";

    el.appendChild(halo);
    el.appendChild(boardingRing);
    el.appendChild(rotor);

    this.el = el;
    this.halo = halo;
    this.boardingRing = boardingRing;
    this.rotor = rotor;
    this.renderVariant();
    this.applySize();
    this.applyStale();
    this.setPath(path);

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
    this.rotor.innerHTML = "";
    if (this.variant === "premium") {
      const glow = document.createElement("div");
      glow.style.position = "absolute";
      glow.style.inset = "0";
      glow.style.borderRadius = "50%";
      glow.style.background =
        "radial-gradient(circle, color-mix(in oklab, #d99645 35%, transparent) 0%, transparent 65%)";
      glow.style.opacity = this.focused ? "0.95" : "0";
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
      img.style.filter = this.focused
        ? "drop-shadow(0 6px 10px rgba(20,20,20,0.35))"
        : "drop-shadow(0 3px 6px rgba(20,20,20,0.28))";
      this.rotor.appendChild(glow);
      this.rotor.appendChild(img);
    } else {
      // Lightweight directional triangle. Points "up" by default — the rotor
      // applies the bearing, matching the premium asset's convention.
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.style.width = "100%";
      svg.style.height = "100%";
      svg.style.filter = "drop-shadow(0 1px 2px rgba(20,20,20,0.35))";
      const tri = document.createElementNS(svgNS, "path");
      tri.setAttribute("d", "M12 3 L19 19 L12 16 L5 19 Z");
      tri.setAttribute("fill", "#2d8a9e"); // aegean-deep
      tri.setAttribute("stroke", "#ffffff");
      tri.setAttribute("stroke-width", "1.5");
      tri.setAttribute("stroke-linejoin", "round");
      svg.appendChild(tri);
      this.rotor.appendChild(svg);
    }
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

  /** Provide the trip's stop polyline so we glide along it instead of
   *  straight-lerping through buildings. Pass null to revert to lerp. */
  setPath(path: { lat: number; lng: number }[] | null) {
    if (!path || path.length < 2) {
      this.path = null;
      this.cum = [];
      return;
    }
    if (this.path === path) return;
    this.path = path;
    this.cum = [0];
    for (let i = 1; i < path.length; i++) {
      this.cum.push(this.cum[i - 1] + haversineM(path[i - 1], path[i]));
    }
  }

  setTarget(lat: number, lng: number, bearing: number, nowMs: number, speedMps = 0) {
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

    // If we have a path, snap both endpoints; require forward motion
    // along the line, else fall back to straight lerp for this hop.
    this.usePath = false;
    if (this.path && this.path.length >= 2) {
      const from = snapAlong({ lat: this.fromLat, lng: this.fromLng }, this.path, this.cum);
      const to = snapAlong({ lat: this.toLat, lng: this.toLng }, this.path, this.cum);
      if (from && to && to.along >= from.along - 25) {
        this.fromAlong = from.along;
        this.toAlong = Math.max(from.along, to.along);
        this.usePath = true;
      }
    }

    // Tween duration scales with distance + live speed so a stopped bus
    // visibly stops and a fast bus moves faster. Clamp into a sane range
    // (next feed refresh is ~20s, so cap < that).
    const distM = this.usePath
      ? Math.max(0, this.toAlong - this.fromAlong)
      : haversineM({ lat: this.fromLat, lng: this.fromLng }, { lat, lng });
    if (speedMps < 0.5 || distM < 3) {
      // Bus is stopped (or barely moved) — short, gentle settle.
      this.tweenDur = 1200;
      this.setBoarding(true);
    } else {
      const dur = (distM / speedMps) * 1000;
      this.tweenDur = Math.max(1500, Math.min(18_000, dur));
      this.setBoarding(false);
    }
  }

  private setBoarding(on: boolean) {
    if (on === this.boarding) return;
    this.boarding = on;
    this.boardingRing.style.opacity = on ? "1" : "0";
    this.boardingRing.style.animation = on
      ? "aloya-board-pulse 1600ms ease-out infinite"
      : "none";
  }

  isBoarding() {
    return this.boarding;
  }

  getPos() {
    return { lat: this.curLat, lng: this.curLng };
  }

  tick(nowMs: number) {
    const t = Math.min(1, (nowMs - this.tweenStart) / this.tweenDur);
    const e = EASE(t);
    let lat: number, lng: number;
    let pathBearing: number | null = null;

    if (this.usePath && this.path) {
      const along = lerp(this.fromAlong, this.toAlong, e);
      const sample = sampleAlong(this.path, this.cum, along);
      lat = sample.lat;
      lng = sample.lng;
      pathBearing = sample.bearing;
    } else {
      lat = lerp(this.fromLat, this.toLat, e);
      lng = lerp(this.fromLng, this.toLng, e);
    }

    this.curLat = lat;
    this.curLng = lng;

    const projection = this.overlay.getProjection();
    if (!projection) return;
    const pt = projection.fromLatLngToDivPixel(new this.api.maps.LatLng(lat, lng));
    if (!pt) return;


    // Prefer the path-derived bearing when gliding along a polyline — it
    // matches the visible direction of travel even if the feed's bearing
    // is stale or coarse.
    if (pathBearing != null) {
      this.currentBearing = pathBearing;
    } else {
      this.currentBearing = this.fromBearing + this.bearingDelta * e;
    }
    this.el.style.transform = `translate3d(${pt.x - this.size / 2}px, ${pt.y - this.size / 2}px, 0)`;
    this.rotor.style.transform = `rotate(${this.currentBearing}deg)`;
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

// --- polyline helpers (local equirectangular, plenty accurate at Cyprus scale) ---

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function snapAlong(
  p: { lat: number; lng: number },
  path: { lat: number; lng: number }[],
  cum: number[],
): { along: number; segIndex: number } | null {
  if (path.length < 2) return null;
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const toXY = (q: { lat: number; lng: number }) => ({
    x: (q.lng - p.lng) * mPerLng,
    y: (q.lat - p.lat) * mPerLat,
  });
  let bestSeg = 0;
  let bestDist2 = Infinity;
  let bestT = 0;
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
    if (d2 < bestDist2) {
      bestDist2 = d2;
      bestSeg = i;
      bestT = t;
    }
  }
  const segLen = cum[bestSeg + 1] - cum[bestSeg];
  return { along: cum[bestSeg] + segLen * bestT, segIndex: bestSeg };
}

function sampleAlong(
  path: { lat: number; lng: number }[],
  cum: number[],
  along: number,
): { lat: number; lng: number; bearing: number } {
  const total = cum[cum.length - 1];
  const clamped = Math.max(0, Math.min(total, along));
  // Binary search would be marginal here; paths are short. Linear is fine.
  let i = 0;
  for (; i < cum.length - 1; i++) {
    if (clamped <= cum[i + 1]) break;
  }
  const a = path[i];
  const b = path[Math.min(path.length - 1, i + 1)];
  const segLen = Math.max(1e-6, cum[i + 1] - cum[i]);
  const t = (clamped - cum[i]) / segLen;
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  // Bearing from a → b (degrees clockwise from north)
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { lat, lng, bearing };
}

// Inject the boarding-pulse keyframes once per page load. Keeps the
// animation purely CSS-driven so React + the rAF loop stay lean.
let boardingKeyframesInjected = false;
function ensureBoardingKeyframes() {
  if (boardingKeyframesInjected || typeof document === "undefined") return;
  boardingKeyframesInjected = true;
  const style = document.createElement("style");
  style.textContent = `@keyframes aloya-board-pulse {
    0%   { transform: scale(0.75); opacity: 0.85; }
    70%  { transform: scale(1.45); opacity: 0; }
    100% { transform: scale(1.45); opacity: 0; }
  }`;
  document.head.appendChild(style);
}

/* ============================================================
 * UserHereOverlay — Google-Maps-style "blue dot" for the rider's
 * own location, with an optional translucent heading cone when a
 * compass or GPS heading is available. Lightweight DOM overlay so
 * it composites smoothly with the gliding bus markers.
 * ============================================================ */
class UserHereOverlay {
  private overlay: google.maps.OverlayView;
  private el: HTMLDivElement;
  private cone: HTMLDivElement;
  private accuracyHalo: HTMLDivElement;
  private lat: number;
  private lng: number;
  private heading: number | null;
  private accuracyM: number;

  constructor(
    api: typeof google,
    map: google.maps.Map,
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

    // Heading cone — translucent wedge, points "up" (rotated by heading).
    const cone = document.createElement("div");
    cone.style.position = "absolute";
    cone.style.left = "50%";
    cone.style.top = "50%";
    cone.style.width = "120px";
    cone.style.height = "120px";
    cone.style.transformOrigin = "50% 50%";
    cone.style.background =
      "conic-gradient(from -30deg at 50% 50%, transparent 0deg, color-mix(in oklab, #2d8a9e 55%, transparent) 30deg, color-mix(in oklab, #2d8a9e 0%, transparent) 60deg, transparent 60deg)";
    cone.style.maskImage =
      "radial-gradient(circle at 50% 50%, black 12%, rgba(0,0,0,0.85) 35%, transparent 65%)";
    // Webkit fallback for the mask.
    (cone.style as unknown as { webkitMaskImage: string }).webkitMaskImage =
      "radial-gradient(circle at 50% 50%, black 12%, rgba(0,0,0,0.85) 35%, transparent 65%)";
    cone.style.transform = "translate(-50%, -50%) rotate(0deg)";
    cone.style.opacity = this.heading == null ? "0" : "1";
    cone.style.transition = "opacity 240ms ease";

    // Pulsing soft outer ring.
    const pulse = document.createElement("div");
    pulse.style.position = "absolute";
    pulse.style.left = "50%";
    pulse.style.top = "50%";
    pulse.style.width = "36px";
    pulse.style.height = "36px";
    pulse.style.borderRadius = "50%";
    pulse.style.transform = "translate(-50%, -50%)";
    pulse.style.background = "color-mix(in oklab, #2d8a9e 30%, transparent)";
    pulse.style.animation = "aloya-here-pulse 1800ms ease-out infinite";

    // Core dot — white ring + aegean center, classic "you" marker.
    const dot = document.createElement("div");
    dot.style.position = "absolute";
    dot.style.left = "50%";
    dot.style.top = "50%";
    dot.style.width = "18px";
    dot.style.height = "18px";
    dot.style.borderRadius = "50%";
    dot.style.transform = "translate(-50%, -50%)";
    dot.style.background = "#2d8a9e";
    dot.style.border = "3px solid #ffffff";
    dot.style.boxShadow = "0 2px 6px rgba(20,20,20,0.35)";

    el.appendChild(accuracyHalo);
    el.appendChild(cone);
    el.appendChild(pulse);
    el.appendChild(dot);

    this.el = el;
    this.cone = cone;
    this.accuracyHalo = accuracyHalo;
    this.applyAccuracy(map);
    this.applyHeading();

    const self = this;
    class HereOverlay extends api.maps.OverlayView {
      onAdd() {
        const panes = this.getPanes();
        panes?.floatPane.appendChild(self.el);
      }
      draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const pt = projection.fromLatLngToDivPixel(
          new api.maps.LatLng(self.lat, self.lng),
        );
        if (!pt) return;
        self.el.style.transform = `translate3d(${pt.x}px, ${pt.y}px, 0)`;
        self.applyAccuracy(self["map"]);
      }
      onRemove() {
        self.el.parentNode?.removeChild(self.el);
      }
    }
    // Stash map ref for accuracy scaling on each draw.
    (this as unknown as { map: google.maps.Map }).map = map;
    this.overlay = new HereOverlay();
    this.overlay.setMap(map);
  }

  update(next: { lat: number; lng: number; headingDeg?: number | null; accuracyM?: number }) {
    this.lat = next.lat;
    this.lng = next.lng;
    this.heading = next.headingDeg ?? null;
    this.accuracyM = next.accuracyM ?? this.accuracyM;
    this.applyHeading();
    this.overlay.draw();
  }

  private applyHeading() {
    if (this.heading == null) {
      this.cone.style.opacity = "0";
    } else {
      this.cone.style.opacity = "1";
      this.cone.style.transform = `translate(-50%, -50%) rotate(${this.heading}deg)`;
    }
  }

  private applyAccuracy(map: google.maps.Map) {
    // Convert accuracy in metres to pixels at current zoom.
    const proj = map.getProjection();
    if (!proj) return;
    const zoom = map.getZoom() ?? 14;
    const scale = 2 ** zoom;
    const metersPerPixel =
      (156543.03392 * Math.cos((this.lat * Math.PI) / 180)) / scale;
    const px = Math.max(24, Math.min(160, this.accuracyM / metersPerPixel));
    this.accuracyHalo.style.width = `${px * 2}px`;
    this.accuracyHalo.style.height = `${px * 2}px`;
  }

  destroy() {
    this.overlay.setMap(null);
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
