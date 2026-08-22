// Pure map maths: polyline decoding, span-to-zoom, and the vehicle filter
// that decides which buses a given map is allowed to draw.
//
// No google.maps types here on purpose — these run in the Node test harness.

import type { RealtimeVehicle } from "./api";

export type LatLng = { lat: number; lng: number };

export type VehicleOverride = {
  lat: number;
  lng: number;
  bearing?: number;
  routeId?: string;
  label?: string;
  source?: "feed" | "rider" | "feed+rider" | "synthetic";
};

/** Google's encoded polyline algorithm, decoded to plain lat/lng pairs. */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];
  const out: LatLng[] = [];
  let i = 0,
    lat = 0,
    lng = 0;
  while (i < encoded.length) {
    let b,
      s = 0,
      r = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << s;
      s += 5;
    } while (b >= 0x20);
    lat += r & 1 ? ~(r >> 1) : r >> 1;
    s = 0;
    r = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      r |= (b & 0x1f) << s;
      s += 5;
    } while (b >= 0x20);
    lng += r & 1 ? ~(r >> 1) : r >> 1;
    out.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
  }
  return out;
}

/** Kilometres of visible span -> a Google zoom level, clamped to sane bounds. */
export function spanToZoom(km: number): number {
  return Math.max(6, Math.min(17, Math.round(12 - Math.log2(Math.max(0.1, km) / 8))));
}

/**
 * Applies rider-fused overrides on top of the feed, then narrows to whatever
 * the caller focused on. A focused trip with no feed vehicle still resolves
 * from its override, which is what keeps a rider-tracked bus on the map when
 * the operator feed drops it.
 */
export function filterVehicles(
  base: RealtimeVehicle[],
  overrides: Record<string, VehicleOverride> | undefined,
  focusTripId?: string,
  focusRouteId?: string,
  restrict?: string[],
): RealtimeVehicle[] {
  const apply = (list: RealtimeVehicle[]) => {
    if (!overrides) return list;
    const mapped = list.map((v) => {
      const o = overrides[v.tripId];
      return o
        ? {
            ...v,
            lat: o.lat,
            lng: o.lng,
            bearing: o.bearing ?? v.bearing,
            routeId: o.routeId ?? v.routeId,
            label: o.label ?? v.label,
            source: (o.source ?? v.source) as RealtimeVehicle["source"],
          }
        : v;
    });
    const seen = new Set(mapped.map((v) => v.tripId));
    const extra: RealtimeVehicle[] = Object.entries(overrides)
      .filter(([t]) => !seen.has(t))
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
    return [...mapped, ...extra];
  };
  if (focusTripId || focusRouteId) {
    const byTrip = focusTripId ? base.filter((v) => v.tripId === focusTripId) : [];
    if (byTrip.length) return apply(byTrip);
    if (focusTripId && overrides?.[focusTripId]) {
      return apply([]).filter((v) => v.tripId === focusTripId);
    }
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
