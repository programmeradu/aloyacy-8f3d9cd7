/// <reference types="google.maps" />
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as markerClustererPkg from "@googlemaps/markerclusterer";
import type { MarkerClusterer as MarkerClustererType } from "@googlemaps/markerclusterer";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER, getStop, getRoute } from "@/lib/gtfs";
import { useGoogleMaps, ALOYA_MAP_STYLE } from "@/lib/useGoogleMaps";
import { prefetchShapes, getShapeForTripSync } from "@/lib/shapes";
import { IconExpand, IconClose } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { distanceM as haversineM } from "@aloya/core/geo";
import { spanToZoom, vehicleOverlayKey } from "@aloya/core/path-geometry";
import { AnimatedBus } from "@/components/map/AnimatedBus";
import { UserHereOverlay } from "@/components/map/UserHereOverlay";

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
  vehicleOverrides?: Record<
    string,
    {
      lat: number;
      lng: number;
      bearing?: number;
      routeId?: string;
      label?: string;
      source?: "feed" | "rider" | "feed+rider" | "synthetic";
    }
  >;
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
  // placeName is derived from browser geolocation on the client, so the SSR
  // markup ("Cyprus") never matches. Render the badge only after hydration.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const { api, error } = useGoogleMaps();
  const { data: rt } = useRealtime();
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const originalParentRef = useRef<HTMLElement | null>(null);
  const originalNextSiblingRef = useRef<Node | null>(null);
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
      const nextExpanded = !expanded;
      setFallbackOverlay(nextExpanded);
      setExpanded(nextExpanded);
      return;
    }
    try {
      if (!document.fullscreenElement) {
        await wrap.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      const nextExpanded = !expanded;
      setFallbackOverlay(nextExpanded);
      setExpanded(nextExpanded);
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

  useLayoutEffect(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;

    if (expanded && fallbackOverlay) {
      if (!originalParentRef.current) {
        originalParentRef.current = wrap.parentElement;
        originalNextSiblingRef.current = wrap.nextSibling;
      }
      if (wrap.parentElement !== document.body) {
        document.body.appendChild(wrap);
      }
      return;
    }

    const parent = originalParentRef.current;
    if (!parent || wrap.parentElement === parent) return;
    const nextSibling = originalNextSiblingRef.current;
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(wrap, nextSibling);
    } else {
      parent.appendChild(wrap);
    }
  }, [expanded, fallbackOverlay]);

  useEffect(() => {
    if (expanded || !fallbackOverlay) return;
    const id = window.requestAnimationFrame(() => setFallbackOverlay(false));
    return () => window.cancelAnimationFrame(id);
  }, [expanded, fallbackOverlay]);

  // Update center / zoom when no fit content is needed
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const hasContent = (polyline && polyline.length > 0) || (markers && markers.length > 0);
    const shouldFit = fitToContent ?? hasContent;
    if (!shouldFit) {
      m.setCenter(center);
      m.setZoom(spanToZoom(spanKm));
    }
    // center.lat/lng are depended on individually so a new object identity from
    // the parent does not re-pan the map on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .map(
          ([k, v]) =>
            `${k}:${v.lat.toFixed(5)},${v.lng.toFixed(5)},${Math.round(v.bearing ?? 0)},${v.routeId ?? ""},${v.source ?? ""}`,
        )
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
      const focusedFallback =
        focusTripId && vehicleOverrides?.[focusTripId]
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
  useEffect(() => {
    prefetchShapes();
  }, []);
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
    return () => {
      cancelled = true;
    };
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
        bus.prime(targetLat, targetLng, targetBearing, now, v.timestamp ?? 0, v.speed ?? 0);
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
              mk.setIcon({
                ...icon,
                scale: on ? (icon.scale ?? 6) * 1.6 : (icon.scale ?? 6) / 1.6,
              });
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
    // The overlay is imperatively updated from the ref; re-running on every
    // userLocation identity change would rebuild the marker each GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    api,
    userLocation?.lat,
    userLocation?.lng,
    userLocation?.headingDeg,
    userLocation?.accuracyM,
  ]);

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
      // Layer refs are torn down exactly once on unmount; reading .current in the
      // cleanup is the intended lifetime here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // iOS Safari fallback: when we go fullscreen via the in-page `position:
  // fixed` overlay (no native Fullscreen API), any ancestor with a
  // `transform`, `filter`, or `perspective` creates a containing block that
  // traps our fixed wrapper. That makes the map render at the wrong size or
  // not paint at all (just the limestone background shows). Walk up from the
  // wrapper and neutralize those properties for the duration of the overlay.
  useEffect(() => {
    if (!(expanded && fallbackOverlay)) return;
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const restorers: Array<() => void> = [];
    let el: HTMLElement | null = wrap.parentElement;
    while (el && el !== document.body) {
      const cs = window.getComputedStyle(el);
      const needsFix =
        (cs.transform && cs.transform !== "none") ||
        (cs.filter && cs.filter !== "none") ||
        (cs.perspective && cs.perspective !== "none") ||
        cs.contain.includes("paint") ||
        cs.contain.includes("layout");
      if (needsFix) {
        const prevTransform = el.style.transform;
        const prevFilter = el.style.filter;
        const prevPerspective = el.style.perspective;
        const prevContain = el.style.contain;
        el.style.setProperty("transform", "none", "important");
        el.style.setProperty("filter", "none", "important");
        el.style.setProperty("perspective", "none", "important");
        el.style.setProperty("contain", "none", "important");
        const target = el;
        restorers.push(() => {
          target.style.transform = prevTransform;
          target.style.filter = prevFilter;
          target.style.perspective = prevPerspective;
          target.style.contain = prevContain;
        });
      }
      el = el.parentElement;
    }
    return () => {
      restorers.forEach((r) => r());
    };
  }, [expanded, fallbackOverlay]);

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

  const liveCount = focused || restricted ? (vehicles?.length ?? 0) : (rt?.vehicles.length ?? 0);

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
      ? "fixed inset-0 z-[2147483000] w-screen h-screen overflow-hidden bg-limestone-soft"
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
                ? (liveLabel?.active ?? t("map.live.active"))
                : (liveLabel?.empty ?? t("map.live.locating"))
              : restricted
                ? liveCount
                  ? (liveLabel?.active ?? `${liveCount} serving, live`)
                  : (liveLabel?.empty ?? t("map.live.none"))
                : liveCount
                  ? `${liveCount} live`
                  : "Connecting"}
          </span>
        </div>
      )}
      {hydrated && placeName && (
        <div className="pointer-events-none absolute bottom-3 right-3 max-w-[65%] rounded-2xl bg-white/85 backdrop-blur-md ring-1 ring-line px-2.5 py-1.5 text-right font-mono text-[10px] leading-[1.35] uppercase tracking-[0.18em] text-ink-soft">
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
          {debugRows.length === 0 && <p className="text-limestone/50">no animated buses</p>}
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
                    <span className={r.mode === "path" ? "text-aegean" : "text-ochre"}>
                      {r.mode}
                    </span>
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
                  <span>{r.correctionVel !== 0 ? `±${r.correctionVel.toFixed(1)}m/s` : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Keep the same mounted Google Maps host node during the iOS fallback.
  // Re-portaling this subtree creates a new host div, which can leave the
  // Maps canvas attached to the old detached node and paint only the blank
  // limestone overlay. We already neutralize transformed ancestors above, so
  // the fixed wrapper can stay in place without being portaled.
  return content;
}
