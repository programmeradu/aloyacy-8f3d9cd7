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
