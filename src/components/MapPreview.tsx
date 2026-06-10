/// <reference types="google.maps" />
import { useEffect, useMemo, useRef, useState } from "react";
import * as markerClustererPkg from "@googlemaps/markerclusterer";
import type { MarkerClusterer as MarkerClustererType } from "@googlemaps/markerclusterer";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER, getStop, getRoute } from "@/lib/gtfs";
import { useGoogleMaps, ALOYA_MAP_STYLE } from "@/lib/useGoogleMaps";
import { prefetchShapes, getShapeForTripSync } from "@/lib/shapes";
import busPremium from "@/assets/bus-premium.png";
import { IconExpand, IconClose } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

const { MarkerClusterer, SuperClusterAlgorithm } = markerClustererPkg;

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
  vehicleOverrides?: Record<string, { lat: number; lng: number; bearing?: number; routeId?: string; label?: string; source?: "feed" | "rider" | "feed+rider" | "synthetic" }>;
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
  /** Render a live telemetry overlay listing every animated bus (ping age,
   *  mode, speed, correction). For internal /qa stress testing only. */
  debug?: boolean;
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

/** Editorial cluster bubble — limestone fill, ink ring, ochre halo at scale. */
function clusterIcon(count: number): google.maps.Symbol {
  // Bubble grows logarithmically so 20 and 200 don't render at the same size.
  const scale = 13 + Math.min(10, Math.log2(Math.max(2, count)) * 2.5);
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#1c5566",
    fillOpacity: 0.92,
    strokeColor: "#f6f1e4",
    strokeWeight: 3,
    scale,
  };
}


function spanToZoom(spanKm: number) {
  // Rough mercator-ish: zoom 12 ~ 8km span at Nicosia latitude
  const z = Math.round(12 - Math.log2(spanKm / 8));
  return Math.max(6, Math.min(17, z));
}

function vehicleOverlayKey(v: {
  id: string;
  tripId?: string | null;
  routeId?: string | null;
  label?: string | null;
}) {
  if (v.tripId) return `trip:${v.tripId}`;
  if (v.routeId && v.label) return `route:${v.routeId}:label:${v.label}`;
  return `entity:${v.id}`;
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
  debug = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [fallbackOverlay, setFallbackOverlay] = useState(false);

  const { api, error } = useGoogleMaps();
  const { data: rt } = useRealtime();
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const layerRef = useRef<{
    polyline?: google.maps.Polyline;
    markers: google.maps.Marker[];
    clusterer?: MarkerClustererType;
  }>({ markers: [] });
  // Per-vehicle OverlayView state lives outside React so animation can keep
  // tweening smoothly between feed refreshes without rerendering.
  const busLayerRef = useRef<Map<string, AnimatedBus>>(new Map());
  const rafRef = useRef<number | null>(null);
  const userHereRef = useRef<UserHereOverlay | null>(null);

  // Initialize map once API is ready
  useEffect(() => {
    if (!api || !hostRef.current || mapRef.current) return;
    mapRef.current = new api.maps.Map(hostRef.current, {
      center,
      zoom: spanToZoom(spanKm),
      disableDefaultUI: true,
      gestureHandling: "greedy",
      backgroundColor: "#f3ede1",
      styles: ALOYA_MAP_STYLE,
      clickableIcons: false,
    });
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // Native Fullscreen API — browser lifts the wrapper out of the document,
  // so no ancestor transform/overflow can clip it. No portals, no re-parenting
  // the map node, no risk of Google Maps detaching from the DOM.
  const toggleFullscreen = async () => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    // Detect native Fullscreen API support on this element.
    const canNativeFs =
      typeof wrap.requestFullscreen === "function" &&
      typeof document.exitFullscreen === "function" &&
      // iOS Safari exposes neither on Element; double-check the document flag.
      document.fullscreenEnabled !== false;

    if (!canNativeFs) {
      // iOS Safari / older WebKit: use in-page fixed overlay.
      setFallbackOverlay((v) => !v);
      setExpanded((v) => !v);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await wrap.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setFallbackOverlay((v) => !v);
      setExpanded((v) => !v);
    }
  };

  useEffect(() => {
    const onChange = () => {
      const isFs = !!document.fullscreenElement;
      setExpanded((prev) => (fallbackOverlay ? prev : isFs));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fallbackOverlay]);

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
    // Tear down the previous clusterer first so its managed markers detach
    // cleanly (clearMarkers removes them from the map for us).
    layer.clusterer?.clearMarkers();
    layer.clusterer?.setMap(null);
    layer.clusterer = undefined;
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

    // Bucket markers: anonymous "stop" pins are clusterable, while
    // origin/destination/pin markers are anchors the rider must always see.
    const clusterable: google.maps.Marker[] = [];

    (markers ?? []).forEach((mk) => {
      const color = TONE_COLOR[mk.tone ?? "aegean"];
      const isStop = !mk.kind || mk.kind === "stop";
      const marker = new api.maps.Marker({
        position: { lat: mk.lat, lng: mk.lng },
        // Clustered markers get attached by the clusterer; anchors render directly.
        map: isStop ? undefined : m,
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
      if (isStop) clusterable.push(marker);
      bounds.extend(marker.getPosition()!);
      hasBounds = true;
    });

    // Only spin up a clusterer when we actually have a dense set of stops.
    // Below the threshold every marker stays individually visible so small
    // multi-leg previews don't collapse 3 stops into a meaningless cluster.
    // Clustering is for dense fleet/overview maps. On a single-route view
    // (restricted) or an inline trip preview (focused) the rider expects to
    // see every stop on the line — folding them into anonymous "5" / "7"
    // bubbles is confusing. Always render stops individually in those modes.
    if (clusterable.length >= 12 && !restricted && !focused) {
      layer.clusterer = new MarkerClusterer({
        map: m,
        markers: clusterable,
        algorithm: new SuperClusterAlgorithm({ radius: 80, maxZoom: 15 }),
        renderer: {
          render: ({ count, position }) =>
            new api.maps.Marker({
              position,
              icon: clusterIcon(count),
              label: {
                text: String(count),
                color: "#f6f1e4",
                fontFamily: "Geist, system-ui, sans-serif",
                fontSize: "12px",
                fontWeight: "600",
              },
              zIndex: 60,
            }),
        },
      });
    } else {
      // No clusterer: attach the stop markers directly to the map.
      clusterable.forEach((mk) => mk.setMap(m));
    }

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
        .map(([k, v]) => `${k}:${v.lat.toFixed(5)},${v.lng.toFixed(5)},${Math.round(v.bearing ?? 0)},${v.routeId ?? ""},${v.source ?? ""}`)
        .join("|")
    : "";
  const vehicles = useMemo(() => {
    const base = allVehicles ?? [];
    const apply = (list: typeof base) => {
      const mapped = vehicleOverrides
        ? list.map((v) => {
            const o = vehicleOverrides[v.tripId];
            return o
              ? {
                  ...v,
                  lat: o.lat,
                  lng: o.lng,
                  bearing: o.bearing ?? v.bearing,
                  routeId: o.routeId ?? v.routeId,
                  label: o.label ?? v.label,
                  source: o.source ?? v.source,
                }
              : v;
          })
        : list;
      if (!vehicleOverrides) return mapped;
      const seenTrips = new Set(mapped.map((v) => v.tripId));
      const synthetic = Object.entries(vehicleOverrides)
        .filter(([tripId]) => !seenTrips.has(tripId))
        .map(([tripId, v]) => ({
          id: `override:${tripId}`,
          tripId,
          routeId: v.routeId ?? "",
          lat: v.lat,
          lng: v.lng,
          bearing: v.bearing ?? 0,
          speed: 0,
          label: v.label ?? "",
          timestamp: Math.floor(Date.now() / 1000),
          source: v.source ?? "synthetic",
        }));
      return [...mapped, ...synthetic];
    };
    if (focusTripId || focusRouteId) {
      const byTrip = focusTripId ? base.filter((v) => v.tripId === focusTripId) : [];
      if (byTrip.length) return apply(byTrip);
      const focusedFallback = focusTripId && vehicleOverrides?.[focusTripId]
        ? apply([]).filter((v) => v.tripId === focusTripId)
        : [];
      if (focusedFallback.length) return focusedFallback;
      if (focusRouteId) {
        const byRoute = apply(base.filter((v) => v.routeId === focusRouteId));
        if (byRoute.length) return byRoute;
        return apply([]).filter((v) => v.routeId === focusRouteId);
      }
      return apply([]);
    }
    if (restrictTripIds && restrictTripIds.length) {
      const set = new Set(restrictTripIds);
      return apply(base.filter((v) => set.has(v.tripId)));
    }
    return apply(base);
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
    // Build a tripId → agency map first so getStop() can disambiguate the
    // 344 stop IDs that collide across operator feeds. Without this every
    // non-Nicosia trip falls back to lerp mode and the bus teleports.
    const tripAgency = new Map<string, string>();
    for (const v of rt.vehicles) {
      const r = getRoute(v.routeId);
      if (r) tripAgency.set(v.tripId, r.agency);
    }
    const byTrip = new Map<string, { stopId: string; t: number }[]>();
    for (const a of rt.arrivals) {
      const arr = byTrip.get(a.tripId) ?? [];
      arr.push({ stopId: a.stopId, t: a.arrivalUnix });
      byTrip.set(a.tripId, arr);
      if (!tripAgency.has(a.tripId)) {
        const r = getRoute(a.routeId);
        if (r) tripAgency.set(a.tripId, r.agency);
      }
    }
    for (const [tripId, stops] of byTrip) {
      if (out.has(tripId)) continue; // real shape already wins
      stops.sort((x, y) => x.t - y.t);
      const agency = tripAgency.get(tripId);
      const poly: { lat: number; lng: number }[] = [];
      for (const s of stops) {
        const meta = getStop(s.stopId, agency);
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
      const overlayKey = vehicleOverlayKey(v);
      seen.add(overlayKey);
      const existing = layer.get(overlayKey);
      const targetLat = v.lat;
      const targetLng = v.lng;
      const targetBearing = v.bearing ?? 0;
      const path = tripPaths.get(v.tripId) ?? null;
      const ageSec = v.timestamp ? Math.max(0, nowSec - v.timestamp) : 0;
      const stale = ageSec > 90;

      if (existing) {
        existing.setVariant(variant);
        existing.setPath(path);
        existing.setSize(sizePx);
        existing.setFocused(focused);
        existing.setStale(stale);
        // Dedupe: only consume a ping when its upstream timestamp is fresher
        // than the last one we applied. Otherwise the bus continues its
        // smooth dead-reckoning glide between real updates.
        if (!v.timestamp || v.timestamp > existing.getLastTs()) {
          existing.setTarget(targetLat, targetLng, targetBearing, now, v.speed ?? 0);
          existing.setLastTs(v.timestamp ?? 0);
        }
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
        // Record the first ping WITHOUT firing setTarget — that path forces
        // lerp mode + boarding=true (because distM=0 against itself), which
        // would freeze the bus until a second fresh ping arrives. prime()
        // just stores the ping snapshot so the NEXT genuine ping can derive
        // ground speed from distance/dt and immediately go path-mode.
        bus.prime(
          targetLat,
          targetLng,
          targetBearing,
          now,
          v.timestamp ?? 0,
          v.speed ?? 0,
        );
        layer.set(overlayKey, bus);
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

  // After expanding/collapsing (incl. re-parenting via portal), the Maps
  // container has new dimensions. Trigger a resize so tiles re-render.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !api) return;
    const c = m.getCenter();
    const id = window.setTimeout(() => {
      api.maps.event.trigger(m, "resize");
      if (c) m.setCenter(c);
    }, 60);
    return () => window.clearTimeout(id);
  }, [expanded, fallbackOverlay, api]);

  const liveCount = focused || restricted ? vehicles?.length ?? 0 : rt?.vehicles.length ?? 0;
  const placeLabel = useMemo(() => {
    // Sub-degree → meters; round to avoid janky decimals.
    const km = spanKm;
    return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(km * 1000)} m`;
  }, [spanKm]);

  // -------- Debug telemetry (stress test on /qa) --------
  const [debugRows, setDebugRows] = useState<ReturnType<AnimatedBus["getDebug"]>[]>([]);
  useEffect(() => {
    if (!debug) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      const rows = Array.from(busLayerRef.current.values())
        .map((b) => b.getDebug(now))
        .sort((a, b) => a.pingAgeMs - b.pingAgeMs);
      setDebugRows(rows);
    }, 200);
    return () => window.clearInterval(id);
  }, [debug]);

  // Use :fullscreen pseudo-class via inline style fallback. When the wrapper
  // is the browser's fullscreenElement, it's already full viewport — but the
  // rounded corners + ring would look odd, so we drop those when expanded.
  const wrapperClass = expanded
    ? fallbackOverlay
      ? "fixed inset-0 z-[100] w-screen h-screen overflow-hidden bg-limestone-soft"
      : "relative w-full h-full overflow-hidden bg-limestone-soft"
    : `relative w-full overflow-hidden rounded-[28px] ring-1 ring-line bg-limestone-soft ${height}`;

  const content = (
    <div ref={wrapperRef} className={wrapperClass}>
      <div ref={hostRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            Map unavailable
          </p>
        </div>
      )}
      {liveVehicles && !hideLiveBadge && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3.5 py-1.5 backdrop-blur-md ring-1 ring-line">
          <span className="font-sans text-[12px] font-semibold tracking-tight text-ink">
            {focused
              ? liveCount
                ? liveLabel?.active ?? t("map.live.active")
                : liveLabel?.empty ?? t("map.live.locating")
              : restricted
                ? liveCount
                  ? liveLabel?.active ?? `${liveCount} serving, live`
                  : liveLabel?.empty ?? t("map.live.none")
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
          onClick={toggleFullscreen}
          aria-label={expanded ? "Close fullscreen map" : "Expand map"}
          className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-white/90 backdrop-blur-md ring-1 ring-line text-ink shadow-sm transition-colors hover:bg-white"
        >
          {expanded ? <IconClose className="size-4" /> : <IconExpand className="size-4" />}
        </button>
      )}
      {debug && (
        <div className="absolute top-3 left-3 max-h-[70%] w-[280px] overflow-y-auto rounded-2xl bg-ink/92 text-limestone backdrop-blur-md ring-1 ring-ink/30 p-3 font-mono text-[10px] leading-tight shadow-xl">
          <div className="flex items-baseline justify-between pb-2 mb-2 border-b border-limestone/15">
            <span className="uppercase tracking-[0.22em] text-limestone/60">Glide telemetry</span>
            <span className="text-ochre">{debugRows.length}</span>
          </div>
          {debugRows.length === 0 && (
            <p className="text-limestone/50">no animated buses</p>
          )}
          {debugRows.map((r) => {
            const age = r.pingAgeMs < 0 ? "—" : `${(r.pingAgeMs / 1000).toFixed(1)}s`;
            const ageWarn = r.pingAgeMs > 30_000;
            return (
              <div key={r.label} className="py-1.5 border-b border-limestone/10 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-limestone">{r.label}</span>
                  <span className={ageWarn ? "text-ochre" : "text-limestone/60"}>{age}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-limestone/60">
                  <span>
                    <span className={r.mode === "path" ? "text-aegean" : "text-ochre"}>{r.mode}</span>
                    {r.boarding ? " · stop" : r.stale ? " · stale" : ""}
                  </span>
                  <span>{r.speedKmh.toFixed(0)} km/h</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-limestone/45">
                  <span>
                    {r.hasPath
                      ? `${(r.alongM / 1000).toFixed(2)}/${(r.pathTotalM / 1000).toFixed(2)} km`
                      : "no shape"}
                  </span>
                  <span>
                    {r.correctionVel !== 0 ? `±${r.correctionVel.toFixed(1)}m/s` : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // When using the in-page fallback overlay (iOS Safari, no native
  // Fullscreen API), portal to document.body so ancestor `transform`
  // containing blocks (e.g. `animate-rise` sections) don't trap the
  // "fixed inset-0" wrapper inside a local stacking context — which
  // would let the bottom nav and other app chrome paint over it.
  if (expanded && fallbackOverlay && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}

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
const TWEEN_MS = 5500;                  // off-path fallback tween length
const MAX_SNAP_M = 90;                  // accept pings within this of the polyline (urban GPS noise)
const PATH_ATTACH_M = 180;              // even noisier pings still snap to path if one exists
const TELEPORT_M = 400;                 // above this prediction error, fast-settle instead of bleed
const SETTLE_S = 1.5;                   // target time to absorb a normal prediction error
const FAST_SETTLE_S = 0.4;              // settle time for large jumps (replaces hard snap)
const CORRECTION_TAU = 0.6;             // exp-decay constant for the correction velocity
const DENSIFY_MAX_M = 25;               // max segment length after densification
const SPEED_SMOOTH = 0.55;              // EMA weight on the freshest speed sample
const BEARING_SLEW_PER_S = 6;           // radians-equivalent slew rate for bearing follow
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
        // Render at the currently-animated position, NOT the last ping's
        // origin. Without this, every Maps pan/zoom/idle event resets the
        // bus to fromLat/fromLng and the next rAF frame snaps it forward —
        // a visible hop on every gesture.
        const projection = this.getProjection();
        if (!projection) return;
        const pt = projection.fromLatLngToDivPixel(
          new api.maps.LatLng(self.curLat, self.curLng),
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
        const d = haversineM(
          { lat: this.lastPingLat, lng: this.lastPingLng },
          { lat, lng },
        );
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

    const distM = haversineM(
      { lat: this.fromLat, lng: this.fromLng },
      { lat, lng },
    );
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

  getLastTs() {
    return this.lastTs;
  }

  setLastTs(ts: number) {
    this.lastTs = ts;
  }

  /** Record the first ping for a freshly created bus without committing it
   *  to lerp/boarding mode. Sets the speed-derivation baseline so the next
   *  real ping can compute distance/dt and immediately glide. */
  prime(
    lat: number,
    lng: number,
    bearing: number,
    nowMs: number,
    ts: number,
    speedMps = 0,
  ) {
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
): { along: number; segIndex: number; perpM: number } | null {
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
  return {
    along: cum[bestSeg] + segLen * bestT,
    segIndex: bestSeg,
    perpM: Math.sqrt(bestDist2),
  };
}

/** Subdivide any segment longer than `maxSegM` into evenly-spaced points.
 *  Linear-in-degrees is plenty for sub-25m steps at Cyprus latitudes. */
function densifyPath(
  path: { lat: number; lng: number }[],
  maxSegM: number,
): { lat: number; lng: number }[] {
  if (path.length < 2) return path.slice();
  const out: { lat: number; lng: number }[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = haversineM(a, b);
    if (d > maxSegM) {
      const steps = Math.ceil(d / maxSegM);
      for (let j = 1; j < steps; j++) {
        const t = j / steps;
        out.push({
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        });
      }
    }
    out.push(b);
  }
  return out;
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
  private map: google.maps.Map;
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
        self.applyAccuracy(self.map);
      }
      onRemove() {
        self.el.parentNode?.removeChild(self.el);
      }
    }
    this.map = map;
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
