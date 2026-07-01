/// <reference types="google.maps" />
// Web-only MapView — real Google Maps JS. Metro platform-resolves this file
// for `Platform.OS === 'web'` before the native module (`expo-maps`) is even
// imported, so browsers never touch the native SDK and native builds never
// touch google.maps. Same public API as the native MapView.

import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Image } from "react-native";
import { useRealtime } from "@/lib/hooks";
import type { RealtimeVehicle } from "@/lib/api";
import { AppText } from "./AppText";

const KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ??
  "AIzaSyA3COtlmbtIdqAAV_bEVU56OkIELFCD6Hw";
const CHANNEL =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_TRACKING_ID ??
  "bcf7a7f51a787313ea032ccb12bb9417";

const NICOSIA_CENTER = { lat: 35.1856, lng: 33.3823 };
const LIMESTONE = "#F6F1E7";
const INK = "#1F1E18";
const AEGEAN = "#3F9BB2";
const AEGEAN_DEEP = "#1F6C82";
const OCHRE = "#C9853A";
const OLIVE = "#3F4A36";

const BUS_PNG = "/__l5e/assets-v1/1321112e-e415-4ac7-a0cc-ff3ae7bd27fb/bus-premium.png";

export type MapTone = "aegean" | "ochre" | "olive" | "ink";
const TONE: Record<MapTone, string> = {
  aegean: AEGEAN, ochre: OCHRE, olive: OLIVE, ink: INK,
};

export type MapMarker = {
  lat: number; lng: number; label?: string; tone?: MapTone;
  kind?: "origin" | "destination" | "stop" | "pin";
};
export type VehicleOverride = {
  lat: number; lng: number; bearing?: number; routeId?: string;
  label?: string; source?: "feed" | "rider" | "feed+rider" | "synthetic";
};
export type MapViewProps = {
  height?: number;
  center?: { lat: number; lng: number };
  spanKm?: number;
  polyline?: string;
  markers?: MapMarker[];
  liveVehicles?: boolean;
  focusTripId?: string;
  focusRouteId?: string;
  restrictTripIds?: string[];
  vehicleOverrides?: Record<string, VehicleOverride>;
  userLocation?: { lat: number; lng: number } | null;
  fitToContent?: boolean;
};

declare global {
  interface Window {
    google?: typeof google;
    __aloyaGmapsInit?: () => void;
    __aloyaGmapsPromise?: Promise<typeof google>;
  }
}

function loadMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__aloyaGmapsPromise) return window.__aloyaGmapsPromise;
  window.__aloyaGmapsPromise = new Promise((resolve, reject) => {
    window.__aloyaGmapsInit = () => resolve(window.google!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&loading=async&callback=__aloyaGmapsInit&libraries=geometry&channel=${CHANNEL}`;
    s.async = true; s.defer = true;
    s.onerror = () => reject(new Error("maps failed"));
    document.head.appendChild(s);
  });
  return window.__aloyaGmapsPromise;
}

const MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f3ede1" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5a5246" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3ede1" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dde6cf" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#c9bea4" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e8c478" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bcd9d8" }] },
];

function decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
  if (!encoded) return [];
  const out: google.maps.LatLngLiteral[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, s = 0, r = 0;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    s = 0; r = 0;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    out.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return out;
}

function spanToZoom(km: number) {
  return Math.max(6, Math.min(17, Math.round(12 - Math.log2(Math.max(0.1, km) / 8))));
}

function filterVehicles(
  base: RealtimeVehicle[],
  overrides: Record<string, VehicleOverride> | undefined,
  focusTripId?: string, focusRouteId?: string, restrict?: string[],
): RealtimeVehicle[] {
  const apply = (list: RealtimeVehicle[]) => {
    if (!overrides) return list;
    const mapped = list.map((v) => {
      const o = overrides[v.tripId];
      return o ? { ...v, lat: o.lat, lng: o.lng, bearing: o.bearing ?? v.bearing, routeId: o.routeId ?? v.routeId, label: o.label ?? v.label, source: (o.source ?? v.source) as any } : v;
    });
    const seen = new Set(mapped.map((v) => v.tripId));
    const extra: RealtimeVehicle[] = Object.entries(overrides).filter(([t]) => !seen.has(t)).map(([tid, o]) => ({
      id: `override:${tid}`, tripId: tid, routeId: o.routeId ?? "", lat: o.lat, lng: o.lng,
      bearing: o.bearing ?? 0, speed: 0, label: o.label ?? "",
      timestamp: Math.floor(Date.now() / 1000), source: (o.source ?? "synthetic") as any,
    }));
    return [...mapped, ...extra];
  };
  if (focusTripId || focusRouteId) {
    const byTrip = focusTripId ? base.filter((v) => v.tripId === focusTripId) : [];
    if (byTrip.length) return apply(byTrip);
    if (focusTripId && overrides?.[focusTripId]) return apply([]).filter((v) => v.tripId === focusTripId);
    if (focusRouteId) {
      const byRoute = base.filter((v) => v.routeId === focusRouteId);
      return byRoute.length ? apply(byRoute) : apply([]).filter((v) => v.routeId === focusRouteId);
    }
    return apply([]);
  }
  if (restrict?.length) {
    const s = new Set(restrict);
    return apply(base.filter((v) => s.has(v.tripId)));
  }
  return apply(base);
}

type BusState = { lat: number; lng: number; bearing: number; targetLat: number; targetLng: number; targetBearing: number; startAt: number };

export function MapView(props: MapViewProps) {
  const {
    height = 256, center = NICOSIA_CENTER, spanKm = 8, polyline,
    markers, liveVehicles = true, focusTripId, focusRouteId, restrictTripIds,
    vehicleOverrides, userLocation, fitToContent,
  } = props;

  const { data: rt } = useRealtime();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const layerRef = useRef<{
    polyline?: google.maps.Polyline;
    stopMarkers: google.maps.Marker[];
    anchorMarkers: google.maps.Marker[];
    busMarkers: Map<string, google.maps.Marker>;
    busState: Map<string, BusState>;
    userMarker?: google.maps.Marker;
    raf?: number;
  }>({ stopMarkers: [], anchorMarkers: [], busMarkers: new Map(), busState: new Map() });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicles = useMemo(() => {
    if (!liveVehicles || !rt?.vehicles) return [] as RealtimeVehicle[];
    return filterVehicles(rt.vehicles, vehicleOverrides, focusTripId, focusRouteId, restrictTripIds);
  }, [liveVehicles, rt?.vehicles, focusTripId, focusRouteId, restrictTripIds?.join(","), vehicleOverrides && JSON.stringify(vehicleOverrides)]);

  const polylinePoints = useMemo(() => (polyline ? decodePolyline(polyline) : []), [polyline]);

  // Init map
  useEffect(() => {
    let cancelled = false;
    loadMaps().then((g) => {
      if (cancelled || !hostRef.current) return;
      mapRef.current = new g.maps.Map(hostRef.current, {
        center, zoom: spanToZoom(spanKm),
        disableDefaultUI: true, gestureHandling: "greedy",
        backgroundColor: LIMESTONE, styles: MAP_STYLE, clickableIcons: false,
      });
      setReady(true);
    }).catch((e) => setError(e.message ?? String(e)));
    return () => {
      cancelled = true;
      if (layerRef.current.raf) cancelAnimationFrame(layerRef.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polyline
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    layerRef.current.polyline?.setMap(null);
    if (polylinePoints.length) {
      layerRef.current.polyline = new google.maps.Polyline({
        path: polylinePoints, strokeColor: AEGEAN_DEEP, strokeOpacity: 0.85, strokeWeight: 4, map,
      });
    }
  }, [ready, polylinePoints]);

  // Markers (stops + anchors)
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    layerRef.current.stopMarkers.forEach((m) => m.setMap(null));
    layerRef.current.anchorMarkers.forEach((m) => m.setMap(null));
    layerRef.current.stopMarkers = [];
    layerRef.current.anchorMarkers = [];
    for (const m of markers ?? []) {
      const isAnchor = m.kind && m.kind !== "stop";
      const color = isAnchor
        ? m.kind === "origin" ? INK : m.kind === "destination" ? OCHRE : TONE[m.tone ?? "aegean"]
        : AEGEAN;
      const marker = new google.maps.Marker({
        position: { lat: m.lat, lng: m.lng }, map, title: m.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color, fillOpacity: 1,
          strokeColor: "#ffffff", strokeWeight: isAnchor ? 3 : 2,
          scale: isAnchor ? 8 : 5,
        },
        zIndex: isAnchor ? 200 : 40,
      });
      (isAnchor ? layerRef.current.anchorMarkers : layerRef.current.stopMarkers).push(marker);
    }
  }, [ready, markers]);

  // User marker
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    layerRef.current.userMarker?.setMap(null);
    if (userLocation) {
      layerRef.current.userMarker = new google.maps.Marker({
        position: { lat: userLocation.lat, lng: userLocation.lng }, map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: AEGEAN, fillOpacity: 1,
          strokeColor: "#ffffff", strokeWeight: 4, scale: 8,
        },
        zIndex: 500,
      });
    }
  }, [ready, userLocation?.lat, userLocation?.lng]);

  // Fit content
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const fit = fitToContent ?? true;
    if (!fit) return;
    const bounds = new google.maps.LatLngBounds();
    let any = false;
    for (const p of polylinePoints) { bounds.extend(p); any = true; }
    for (const m of markers ?? []) { bounds.extend({ lat: m.lat, lng: m.lng }); any = true; }
    for (const v of vehicles) { bounds.extend({ lat: v.lat, lng: v.lng }); any = true; }
    if (userLocation) { bounds.extend(userLocation); any = true; }
    if (any && !bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, polylinePoints, markers, vehicles.length, userLocation?.lat]);

  // Bus markers + RAF glide
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const now = performance.now();
    const seen = new Set<string>();
    for (const v of vehicles) {
      const key = v.tripId || v.id;
      seen.add(key);
      const state = layerRef.current.busState.get(key);
      if (!state) {
        layerRef.current.busState.set(key, {
          lat: v.lat, lng: v.lng, bearing: v.bearing ?? 0,
          targetLat: v.lat, targetLng: v.lng, targetBearing: v.bearing ?? 0, startAt: now,
        });
      } else {
        state.lat = state.targetLat; state.lng = state.targetLng; state.bearing = state.targetBearing;
        state.targetLat = v.lat; state.targetLng = v.lng;
        state.targetBearing = v.bearing ?? state.targetBearing;
        state.startAt = now;
      }
      if (!layerRef.current.busMarkers.get(key)) {
        const m = new google.maps.Marker({
          position: { lat: v.lat, lng: v.lng }, map,
          icon: {
            url: BUS_PNG, scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 20),
          } as google.maps.Icon,
          title: v.label ?? v.routeId, zIndex: 1000,
        });
        layerRef.current.busMarkers.set(key, m);
      }
    }
    // Remove missing
    for (const [k, m] of layerRef.current.busMarkers) {
      if (!seen.has(k)) { m.setMap(null); layerRef.current.busMarkers.delete(k); layerRef.current.busState.delete(k); }
    }

    // Animation loop
    if (layerRef.current.raf) cancelAnimationFrame(layerRef.current.raf);
    const TWEEN_MS = 2500;
    const tick = (t: number) => {
      layerRef.current.busState.forEach((s, key) => {
        const p = Math.min(1, (t - s.startAt) / TWEEN_MS);
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const lat = s.lat + (s.targetLat - s.lat) * ease;
        const lng = s.lng + (s.targetLng - s.lng) * ease;
        const marker = layerRef.current.busMarkers.get(key);
        if (marker) marker.setPosition({ lat, lng });
      });
      if (layerRef.current.busMarkers.size) {
        layerRef.current.raf = requestAnimationFrame(tick);
      }
    };
    if (layerRef.current.busMarkers.size) {
      layerRef.current.raf = requestAnimationFrame(tick);
    }
  }, [ready, vehicles]);

  return (
    <View style={[styles.wrap, { height }]}>
      <div ref={hostRef as any} style={{ position: "absolute", inset: 0 } as any} />
      {!ready && !error ? (
        <View pointerEvents="none" style={styles.overlay}>
          <AppText style={styles.pill}>Loading map…</AppText>
        </View>
      ) : null}
      {error ? (
        <View pointerEvents="none" style={styles.overlay}>
          <AppText style={styles.pill}>{error}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden", borderRadius: 18, backgroundColor: LIMESTONE, position: "relative" },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 12, alignItems: "center" },
  pill: {
    backgroundColor: "rgba(246,241,231,0.92)", color: INK, fontSize: 12,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: "hidden",
  },
});

export default MapView;
