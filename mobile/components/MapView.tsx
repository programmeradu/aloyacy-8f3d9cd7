// Mobile MapView primitive — native parity for `MapPreview` (web).
//
// Renders live GTFS-RT vehicles, an encoded polyline, and a set of tagged
// markers on top of Expo Maps (Google on Android, Apple on iOS). Web bundles
// (react-native-web preview) fall back to an editorial placeholder so the
// component stays safe in every environment.
//
// Parity notes vs `src/components/MapPreview.tsx`:
//   - `restrictTripIds` / `focusTripId` / `focusRouteId` mirror the web
//     filter semantics so the trip-info and route screens can scope the
//     fleet to the rider's bus.
//   - `vehicleOverrides` lets the live trip companion fuse rider GPS into a
//     specific bus blip (same shape as web).
//   - Stop-marker clustering uses a lightweight lat/lng grid bucket — expo-maps
//     has no built-in clusterer, so we collapse dense stop pins into a single
//     anchor per cell once the count crosses a threshold. Origin/destination
//     markers and live vehicles are never clustered.
//   - Polylines are decoded from Google's polyline algorithm locally; we
//     intentionally avoid pulling @googlemaps/* into RN.
//
// This file is platform-aware but presents a single, stable JS surface so
// downstream screens (`trip-info`, `route`, `trip`, `airport`) import one
// component and pass the same props on iOS, Android, and the web preview.

import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { GoogleMaps, AppleMaps } from "expo-maps";
import { useImage } from "expo-image";
import { useRealtime } from "@/lib/hooks";
import type { RealtimeVehicle } from "@/lib/api";
import { AppText } from "./AppText";
import { assets } from "@/lib/assets";

const BUS_ICON_SRC = require("../assets/images/bus-premium.png");
import { assets } from "@/lib/assets";

const LIMESTONE = "#f3ede1";
const INK = "#2a261f";
const AEGEAN = "#2d8a9e";
const OCHRE = "#d99645";
const OLIVE = "#7d9b76";

// Cyprus-wide default (Nicosia centre) — matches web NICOSIA_CENTER.
const NICOSIA_CENTER = { lat: 35.1856, lng: 33.3823 };

export type MapTone = "aegean" | "ochre" | "olive" | "ink";

export type MapMarker = {
  lat: number;
  lng: number;
  label?: string;
  tone?: MapTone;
  kind?: "origin" | "destination" | "stop" | "pin";
};

export type VehicleOverride = {
  lat: number;
  lng: number;
  bearing?: number;
  routeId?: string;
  label?: string;
  source?: "feed" | "rider" | "feed+rider" | "synthetic";
};

export type MapViewProps = {
  height?: number;
  center?: { lat: number; lng: number };
  /** Approximate viewport span in km. Used as fallback zoom when no content. */
  spanKm?: number;
  /** Encoded Google polyline. */
  polyline?: string;
  markers?: MapMarker[];
  /** Overlay realtime bus vehicles. Defaults to true. */
  liveVehicles?: boolean;
  focusTripId?: string;
  focusRouteId?: string;
  restrictTripIds?: string[];
  vehicleOverrides?: Record<string, VehicleOverride>;
  /** Rider "you are here" dot. */
  userLocation?: { lat: number; lng: number } | null;
  /** Fit camera to markers + polyline. Defaults to true when content exists. */
  fitToContent?: boolean;
};

const TONE_COLOR: Record<MapTone, string> = {
  aegean: AEGEAN,
  ochre: OCHRE,
  olive: OLIVE,
  ink: INK,
};

// ---------------------------------------------------------------------------
// Polyline decoder — Google's polyline algorithm. Pure JS, no deps.
// ---------------------------------------------------------------------------
function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  if (!encoded) return [];
  const out: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    out.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Simple grid clustering for dense stop pins. Origin/destination/pin markers
// always render as individual anchors — clustering only applies to stops.
// ---------------------------------------------------------------------------
function clusterStops(stops: MapMarker[], cellDeg = 0.004): MapMarker[] {
  if (stops.length < 30) return stops;
  const buckets = new Map<string, { lat: number; lng: number; n: number }>();
  for (const s of stops) {
    const key = `${Math.round(s.lat / cellDeg)}:${Math.round(s.lng / cellDeg)}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.lat = (cur.lat * cur.n + s.lat) / (cur.n + 1);
      cur.lng = (cur.lng * cur.n + s.lng) / (cur.n + 1);
      cur.n += 1;
    } else {
      buckets.set(key, { lat: s.lat, lng: s.lng, n: 1 });
    }
  }
  return Array.from(buckets.values()).map((b) => ({
    lat: b.lat,
    lng: b.lng,
    tone: "aegean" as const,
    kind: "stop" as const,
    label: b.n > 1 ? `${b.n}` : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Vehicle filtering — mirrors MapPreview semantics so trip/route screens get
// the same scoped fleet on mobile.
// ---------------------------------------------------------------------------
function filterVehicles(
  base: RealtimeVehicle[],
  overrides: Record<string, VehicleOverride> | undefined,
  focusTripId: string | undefined,
  focusRouteId: string | undefined,
  restrictTripIds: string[] | undefined,
): RealtimeVehicle[] {
  const applyOverrides = (list: RealtimeVehicle[]): RealtimeVehicle[] => {
    if (!overrides) return list;
    const mapped = list.map((v) => {
      const o = overrides[v.tripId];
      if (!o) return v;
      return {
        ...v,
        lat: o.lat,
        lng: o.lng,
        bearing: o.bearing ?? v.bearing,
        routeId: o.routeId ?? v.routeId,
        label: o.label ?? v.label,
        source: (o.source ?? v.source) as RealtimeVehicle["source"],
      };
    });
    const seen = new Set(mapped.map((v) => v.tripId));
    const synthetic: RealtimeVehicle[] = Object.entries(overrides)
      .filter(([tid]) => !seen.has(tid))
      .map(([tid, o]) => ({
        id: `override:${tid}`,
        tripId: tid,
        routeId: o.routeId ?? "",
        lat: o.lat,
        lng: o.lng,
        bearing: o.bearing ?? 0,
        speed: 0,
        label: o.label ?? "",
        timestamp: Math.floor(Date.now() / 1000),
        source: (o.source ?? "synthetic") as RealtimeVehicle["source"],
      }));
    return [...mapped, ...synthetic];
  };

  if (focusTripId || focusRouteId) {
    const byTrip = focusTripId ? base.filter((v) => v.tripId === focusTripId) : [];
    if (byTrip.length) return applyOverrides(byTrip);
    if (focusTripId && overrides?.[focusTripId]) {
      return applyOverrides([]).filter((v) => v.tripId === focusTripId);
    }
    if (focusRouteId) {
      const byRoute = base.filter((v) => v.routeId === focusRouteId);
      if (byRoute.length) return applyOverrides(byRoute);
      return applyOverrides([]).filter((v) => v.routeId === focusRouteId);
    }
    return applyOverrides([]);
  }

  if (restrictTripIds && restrictTripIds.length) {
    const set = new Set(restrictTripIds);
    return applyOverrides(base.filter((v) => set.has(v.tripId)));
  }
  return applyOverrides(base);
}

// ---------------------------------------------------------------------------
// Camera derivation — pick a centre + zoom that fits markers + polyline +
// vehicles. expo-maps takes one initial CameraPosition, so we compute the
// best framing once per render rather than animating fitBounds.
// ---------------------------------------------------------------------------
function deriveCamera(
  fallbackCenter: { lat: number; lng: number },
  spanKm: number,
  points: { lat: number; lng: number }[],
  fitToContent: boolean,
) {
  if (!fitToContent || points.length === 0) {
    return {
      coordinates: {
        latitude: fallbackCenter.lat,
        longitude: fallbackCenter.lng,
      },
      zoom: spanToZoom(spanKm),
    };
  }
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latSpan = Math.max(0.001, maxLat - minLat);
  const lngSpan = Math.max(0.001, maxLng - minLng);
  // Convert lat span to km (1deg ≈ 111km) and pick zoom from the larger axis.
  const spanKmDerived = Math.max(latSpan * 111, lngSpan * 95);
  return {
    coordinates: {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
    },
    zoom: spanToZoom(spanKmDerived * 1.35),
  };
}

function spanToZoom(spanKm: number) {
  const z = Math.round(12 - Math.log2(Math.max(0.1, spanKm) / 8));
  return Math.max(6, Math.min(17, z));
}

// ---------------------------------------------------------------------------
// Smoothed vehicles — tween lat/lng between feed refreshes. Emits a new
// vehicle array up to 10x per second (~100ms) with interpolated positions,
// so the marker glides between the real 20s GTFS-RT snapshots.
// ---------------------------------------------------------------------------
type TweenState = {
  fromLat: number; fromLng: number; fromBearing: number;
  toLat: number; toLng: number; toBearing: number;
  startAt: number; durationMs: number;
};
function useSmoothedVehicles(feed: RealtimeVehicle[]): RealtimeVehicle[] {
  const statesRef = useRef<Map<string, TweenState>>(new Map());
  const [tick, setTick] = useState(0);

  // Sync target on every new feed frame.
  useEffect(() => {
    const now = Date.now();
    const seen = new Set<string>();
    for (const v of feed) {
      const key = v.tripId || v.id;
      seen.add(key);
      const prev = statesRef.current.get(key);
      if (!prev) {
        statesRef.current.set(key, {
          fromLat: v.lat, fromLng: v.lng, fromBearing: v.bearing ?? 0,
          toLat: v.lat, toLng: v.lng, toBearing: v.bearing ?? 0,
          startAt: now, durationMs: 1,
        });
      } else {
        // Continue from current interpolated position, not the last target,
        // so a mid-tween update doesn't jump.
        const p = Math.min(1, (now - prev.startAt) / prev.durationMs);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const curLat = prev.fromLat + (prev.toLat - prev.fromLat) * eased;
        const curLng = prev.fromLng + (prev.toLng - prev.fromLng) * eased;
        statesRef.current.set(key, {
          fromLat: curLat, fromLng: curLng, fromBearing: prev.toBearing,
          toLat: v.lat, toLng: v.lng, toBearing: v.bearing ?? prev.toBearing,
          startAt: now, durationMs: 2500,
        });
      }
    }
    for (const k of Array.from(statesRef.current.keys())) {
      if (!seen.has(k)) statesRef.current.delete(k);
    }
    setTick((t) => t + 1);
  }, [feed]);

  // Drive ~10fps re-renders while any tween is still animating.
  useEffect(() => {
    let raf = 0;
    let lastEmit = 0;
    const loop = () => {
      const now = Date.now();
      let animating = false;
      for (const s of statesRef.current.values()) {
        if (now - s.startAt < s.durationMs) { animating = true; break; }
      }
      if (animating && now - lastEmit > 100) {
        lastEmit = now;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return useMemo(() => {
    const now = Date.now();
    return feed.map((v) => {
      const s = statesRef.current.get(v.tripId || v.id);
      if (!s) return v;
      const p = Math.min(1, (now - s.startAt) / s.durationMs);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      return {
        ...v,
        lat: s.fromLat + (s.toLat - s.fromLat) * eased,
        lng: s.fromLng + (s.toLng - s.fromLng) * eased,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, tick]);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MapView({
  height = 256,
  center = NICOSIA_CENTER,
  spanKm = 8,
  polyline,
  markers,
  liveVehicles = true,
  focusTripId,
  focusRouteId,
  restrictTripIds,
  vehicleOverrides,
  userLocation,
  fitToContent,
}: MapViewProps) {
  const { data: rt } = useRealtime();
  const busIcon = useImage(BUS_ICON_SRC, { maxWidth: 64, maxHeight: 64 });

  const polylinePoints = useMemo(
    () => (polyline ? decodePolyline(polyline) : []),
    [polyline],
  );

  const feedVehicles = useMemo(() => {
    if (!liveVehicles || !rt?.vehicles) return [] as RealtimeVehicle[];
    return filterVehicles(
      rt.vehicles,
      vehicleOverrides,
      focusTripId,
      focusRouteId,
      restrictTripIds,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    liveVehicles,
    rt?.vehicles,
    focusTripId,
    focusRouteId,
    restrictTripIds?.join(","),
    vehicleOverrides && JSON.stringify(vehicleOverrides),
  ]);

  // Smoothed vehicles — tween lat/lng between 20s feed refreshes at ~10fps
  // so buses glide instead of teleporting. Modest rate on native since each
  // tick re-renders the expo-maps view.
  const vehicles = useSmoothedVehicles(feedVehicles);

  // Bucket markers: stops are clusterable, anchors render directly.
  const { anchors, clusteredStops } = useMemo(() => {
    const a: MapMarker[] = [];
    const s: MapMarker[] = [];
    for (const m of markers ?? []) {
      if (!m.kind || m.kind === "stop") s.push(m);
      else a.push(m);
    }
    return { anchors: a, clusteredStops: clusterStops(s) };
  }, [markers]);

  const camera = useMemo(() => {
    const points: { lat: number; lng: number }[] = [];
    for (const p of polylinePoints) points.push(p);
    for (const m of markers ?? []) points.push({ lat: m.lat, lng: m.lng });
    for (const v of vehicles) points.push({ lat: v.lat, lng: v.lng });
    if (userLocation) points.push(userLocation);
    return deriveCamera(center, spanKm, points, fitToContent ?? points.length > 0);
  }, [
    polylinePoints,
    markers,
    vehicles,
    userLocation,
    center.lat,
    center.lng,
    spanKm,
    fitToContent,
  ]);

  if (Platform.OS === "web") {
    return <WebFallback height={height} />;
  }

  // Native marker payloads — Google and Apple have slightly different shapes
  // (Apple uses SF Symbols, Google uses titles + zIndex). We keep both
  // editorial: anchor pins lean on tone colors / monograms, vehicles use a
  // bus symbol so riders can read them at a glance.
  const allCoords = [
    ...anchors.map((a) => ({
      latitude: a.lat,
      longitude: a.lng,
    })),
    ...clusteredStops.map((s) => ({
      latitude: s.lat,
      longitude: s.lng,
    })),
    ...vehicles.map((v) => ({ latitude: v.lat, longitude: v.lng })),
  ];

  if (Platform.OS === "ios") {
    const appleMarkers: AppleMaps.Marker[] = [
      ...anchors.map((m, i) => ({
        id: `anchor:${i}`,
        coordinates: { latitude: m.lat, longitude: m.lng },
        title: m.label,
        tintColor:
          m.kind === "origin"
            ? INK
            : m.kind === "destination"
              ? OCHRE
              : TONE_COLOR[m.tone ?? "aegean"],
        systemImage:
          m.kind === "origin"
            ? "figure.walk.circle.fill"
            : m.kind === "destination"
              ? "mappin.circle.fill"
              : "circle.fill",
      })),
      ...clusteredStops.map((s, i) => ({
        id: `stop:${i}`,
        coordinates: { latitude: s.lat, longitude: s.lng },
        title: s.label,
        tintColor: AEGEAN,
        systemImage: "circle.fill",
      })),
      ...vehicles.map((v) => ({
        id: `veh:${v.id}`,
        coordinates: { latitude: v.lat, longitude: v.lng },
        title: v.label ?? v.routeId,
        tintColor: v.source === "rider" ? AEGEAN : INK,
        ...(busIcon ? { icon: busIcon } : { systemImage: "bus.fill" as const }),
      })),
      ...(userLocation
        ? [
            {
              id: "user",
              coordinates: {
                latitude: userLocation.lat,
                longitude: userLocation.lng,
              },
              tintColor: AEGEAN,
              systemImage: "location.fill",
            },
          ]
        : []),
    ];
    const applePolylines: AppleMaps.MapProps["polylines"] = polylinePoints.length
      ? [
          {
            id: "route",
            coordinates: polylinePoints.map((p) => ({
              latitude: p.lat,
              longitude: p.lng,
            })),
            color: "#1c5566",
            width: 4,
          },
        ]
      : undefined;
    return (
      <View style={[styles.wrap, { height }]}>
        <AppleMaps.View
          style={StyleSheet.absoluteFill}
          cameraPosition={camera}
          markers={appleMarkers}
          polylines={applePolylines}
          properties={{ isMyLocationEnabled: !!userLocation }}
          uiSettings={{ compassEnabled: true, scaleBarEnabled: false }}
        />
        {allCoords.length === 0 ? <EmptyOverlay /> : null}
      </View>
    );
  }

  // Android / Google Maps
  const googleMarkers: GoogleMaps.Marker[] = [
    ...anchors.map((m, i) => ({
      id: `anchor:${i}`,
      coordinates: { latitude: m.lat, longitude: m.lng },
      title: m.label,
      zIndex:
        m.kind === "origin" || m.kind === "destination" ? 100 : 50,
    })),
    ...clusteredStops.map((s, i) => ({
      id: `stop:${i}`,
      coordinates: { latitude: s.lat, longitude: s.lng },
      title: s.label,
      zIndex: 40,
    })),
    ...vehicles.map((v) => ({
      id: `veh:${v.id}`,
      coordinates: { latitude: v.lat, longitude: v.lng },
      title: v.label ?? v.routeId,
      snippet: v.source === "rider" ? "Rider-confirmed" : "Live feed",
      zIndex: 200,
      ...(busIcon ? { icon: busIcon } : {}),
    })),
  ];
  const googlePolylines: GoogleMaps.MapProps["polylines"] = polylinePoints.length
    ? [
        {
          id: "route",
          coordinates: polylinePoints.map((p) => ({
            latitude: p.lat,
            longitude: p.lng,
          })),
          color: "#1c5566",
          width: 4,
        },
      ]
    : undefined;
  return (
    <View style={[styles.wrap, { height }]}>
      <GoogleMaps.View
        style={StyleSheet.absoluteFill}
        cameraPosition={camera}
        markers={googleMarkers}
        polylines={googlePolylines}
        userLocation={
          userLocation
            ? {
                coordinates: {
                  latitude: userLocation.lat,
                  longitude: userLocation.lng,
                },
                followUserLocation: false,
              }
            : undefined
        }
        uiSettings={{
          compassEnabled: true,
          myLocationButtonEnabled: !!userLocation,
          zoomControlsEnabled: false,
        }}
        properties={{ isMyLocationEnabled: !!userLocation }}
      />
      {allCoords.length === 0 ? <EmptyOverlay /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Web fallback — react-native-web preview can't render native MapKit / Google
// Maps SDK. Show a calm limestone tile so screens stay composable in dev.
// ---------------------------------------------------------------------------
function WebFallback({ height }: { height: number }) {
  return (
    <View style={[styles.wrap, styles.web, { height }]}>
      <Image source={assets.cyprus_map} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={styles.webWash} />
      <View style={styles.webRoadOne} />
      <View style={styles.webRoadTwo} />
      <View style={[styles.webPin, { left: "28%", top: "38%", backgroundColor: AEGEAN }]} />
      <View style={[styles.webPin, { left: "62%", top: "54%", backgroundColor: OCHRE }]} />
      <View style={[styles.webPin, { left: "47%", top: "68%", backgroundColor: OLIVE }]} />
      <AppText style={styles.webLabel}>Live Cyprus network</AppText>
    </View>
  );
}

function EmptyOverlay() {
  return (
    <View pointerEvents="none" style={styles.emptyOverlay}>
      <AppText style={styles.emptyLabel}>No live signals in view</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: LIMESTONE,
  },
  web: {
    alignItems: "center",
    justifyContent: "center",
  },
  webWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(243,237,225,0.52)",
  },
  webRoadOne: {
    position: "absolute",
    left: "-8%",
    top: "50%",
    width: "116%",
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(31,108,130,0.55)",
    transform: [{ rotate: "-13deg" }],
  },
  webRoadTwo: {
    position: "absolute",
    left: "10%",
    top: "30%",
    width: "86%",
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(201,133,58,0.5)",
    transform: [{ rotate: "27deg" }],
  },
  webPin: {
    position: "absolute",
    width: 13,
    height: 13,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(246,241,231,0.92)",
  },
  webLabel: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(246,241,231,0.92)",
    color: INK,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  emptyOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: "center",
  },
  emptyLabel: {
    backgroundColor: "rgba(243, 237, 225, 0.92)",
    color: INK,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
});

export default MapView;
