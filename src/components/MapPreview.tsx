/// <reference types="google.maps" />
import { useEffect, useMemo, useRef } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { NICOSIA_CENTER } from "@/lib/gtfs";
import { useGoogleMaps, ALOYA_MAP_STYLE } from "@/lib/useGoogleMaps";

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
  fitToContent,
}: Props) {
  const { api, error } = useGoogleMaps();
  const { data: rt } = useRealtime();
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const layerRef = useRef<{
    polyline?: google.maps.Polyline;
    markers: google.maps.Marker[];
    vehicles: google.maps.Marker[];
  }>({ markers: [], vehicles: [] });

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
  const vehicles = useMemo(() => {
    if (!allVehicles) return undefined;
    if (focusTripId || focusRouteId) {
      const byTrip = focusTripId ? allVehicles.filter((v) => v.tripId === focusTripId) : [];
      if (byTrip.length) return byTrip;
      if (focusRouteId) return allVehicles.filter((v) => v.routeId === focusRouteId);
      return [];
    }
    return allVehicles;
  }, [allVehicles, focusTripId, focusRouteId]);

  const focused = !!(focusTripId || focusRouteId);

  useEffect(() => {
    const m = mapRef.current;
    if (!api || !m) return;
    const layer = layerRef.current;
    layer.vehicles.forEach((v) => v.setMap(null));
    layer.vehicles = [];
    if (!vehicles) return;
    for (const v of vehicles.slice(0, focused ? 1 : 40)) {
      const marker = new api.maps.Marker({
        position: { lat: v.lat, lng: v.lng },
        map: m,
        title: v.label || undefined,
        icon: {
          path: "M0,-6 L4,4 L0,2 L-4,4 Z",
          fillColor: focused ? "#d99645" : "#2d8a9e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: focused ? 2.5 : 1.5,
          scale: focused ? 1.9 : 1.2,
          rotation: v.bearing ?? 0,
        },
        zIndex: focused ? 200 : 10,
      });
      layer.vehicles.push(marker);
    }
  }, [api, vehicles, focused]);

  const liveCount = focused ? vehicles?.length ?? 0 : rt?.vehicles.length ?? 0;
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
