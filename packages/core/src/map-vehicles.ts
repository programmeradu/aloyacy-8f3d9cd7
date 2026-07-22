/**
 * Pure selection + path-building logic for the live vehicle layer.
 *
 * The map component owns Google Maps objects; everything in here is plain data
 * so the same rules can be unit-tested and reused by the mobile app, which
 * renders the identical fleet through a different map SDK.
 */

export type MapVehicle = {
  id: string;
  tripId: string;
  routeId: string;
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  label?: string;
  timestamp?: number;
  source?: string;
};

export type VehicleOverride = {
  lat: number;
  lng: number;
  bearing?: number;
  routeId?: string;
  label?: string;
  source?: "feed" | "rider" | "feed+rider" | "synthetic";
};

export type LatLng = { lat: number; lng: number };

/**
 * Stable dependency key for a set of overrides. Positions are rounded to ~1m
 * and bearings to whole degrees so a jittering GPS fix does not retrigger the
 * effect on every sub-metre update.
 */
export function overrideSignature(overrides?: Record<string, VehicleOverride>): string {
  if (!overrides) return "";
  return Object.entries(overrides)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(
      ([k, v]) =>
        `${k}:${v.lat.toFixed(5)},${v.lng.toFixed(5)},${Math.round(v.bearing ?? 0)},${v.routeId ?? ""},${v.source ?? ""}`,
    )
    .join("|");
}

/**
 * Fold rider/fused overrides into a feed list. A trip present in the overrides
 * but absent from the feed becomes a synthetic vehicle, so a rider whose own
 * GPS is the only signal still sees their bus on the map.
 */
export function applyOverrides(
  list: MapVehicle[],
  overrides: Record<string, VehicleOverride> | undefined,
  nowSec = Math.floor(Date.now() / 1000),
): MapVehicle[] {
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
      source: o.source ?? v.source,
    };
  });
  const seenTrips = new Set(mapped.map((v) => v.tripId));
  const synthetic: MapVehicle[] = Object.entries(overrides)
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
      timestamp: nowSec,
      source: v.source ?? "synthetic",
    }));
  return synthetic.length ? [...mapped, ...synthetic] : mapped;
}

export type VehicleSelection = {
  vehicles?: MapVehicle[];
  overrides?: Record<string, VehicleOverride>;
  /** Show only this trip (with prominent styling). */
  focusTripId?: string;
  /** Fallback when no vehicle in the snapshot matches focusTripId. */
  focusRouteId?: string;
  /** Limit the layer to the buses relevant to a stop/route view. */
  restrictTripIds?: string[];
  nowSec?: number;
};

/**
 * Decide which vehicles the map should draw.
 *
 * Focus wins over restriction, and inside focus we degrade gracefully:
 * exact trip match, then a synthetic override for that trip, then any bus on
 * the same route. That ladder is what keeps a journey screen from going empty
 * when the operator recycles trip IDs mid-service.
 */
export function selectMapVehicles({
  vehicles,
  overrides,
  focusTripId,
  focusRouteId,
  restrictTripIds,
  nowSec,
}: VehicleSelection): MapVehicle[] {
  const base = vehicles ?? [];
  const apply = (list: MapVehicle[]) => applyOverrides(list, overrides, nowSec);

  if (focusTripId || focusRouteId) {
    const byTrip = focusTripId ? base.filter((v) => v.tripId === focusTripId) : [];
    if (byTrip.length) return apply(byTrip);

    const synthesized = apply([]);
    const focusedFallback =
      focusTripId && overrides?.[focusTripId]
        ? synthesized.filter((v) => v.tripId === focusTripId)
        : [];
    if (focusedFallback.length) return focusedFallback;

    if (focusRouteId) {
      const byRoute = apply(base.filter((v) => v.routeId === focusRouteId));
      if (byRoute.length) return byRoute;
      return synthesized.filter((v) => v.routeId === focusRouteId);
    }
    return synthesized;
  }

  if (restrictTripIds && restrictTripIds.length) {
    const set = new Set(restrictTripIds);
    return apply(base.filter((v) => set.has(v.tripId)));
  }
  return apply(base);
}

export type TripPathInput = {
  vehicles: MapVehicle[];
  arrivals: { tripId: string; routeId: string; stopId: string; arrivalUnix: number }[];
  /** Real GTFS shape for a trip, when the shape index has loaded. */
  shapeFor: (tripId: string, routeId: string) => LatLng[] | null | undefined;
  /** Stop coordinates, disambiguated by agency (stop IDs collide across feeds). */
  stopFor: (stopId: string, agency?: string) => LatLng | null | undefined;
  /** Agency owning a route, used to disambiguate colliding stop IDs. */
  agencyForRoute: (routeId: string) => string | undefined;
};

/**
 * tripId → polyline the bus glides along between feed pings.
 *
 * Real GTFS shapes always win. Where no shape exists we stitch the trip's
 * upcoming stops in time order: straight stop-to-stop segments are coarse, but
 * far better than letting the marker teleport along the ping-to-ping line.
 */
export function buildTripPaths({
  vehicles,
  arrivals,
  shapeFor,
  stopFor,
  agencyForRoute,
}: TripPathInput): Map<string, LatLng[]> {
  const out = new Map<string, LatLng[]>();

  for (const v of vehicles) {
    const shape = shapeFor(v.tripId, v.routeId);
    if (shape && shape.length >= 2) out.set(v.tripId, shape);
  }

  const tripAgency = new Map<string, string>();
  for (const v of vehicles) {
    const agency = agencyForRoute(v.routeId);
    if (agency) tripAgency.set(v.tripId, agency);
  }

  const byTrip = new Map<string, { stopId: string; t: number }[]>();
  for (const a of arrivals) {
    const arr = byTrip.get(a.tripId) ?? [];
    arr.push({ stopId: a.stopId, t: a.arrivalUnix });
    byTrip.set(a.tripId, arr);
    if (!tripAgency.has(a.tripId)) {
      const agency = agencyForRoute(a.routeId);
      if (agency) tripAgency.set(a.tripId, agency);
    }
  }

  for (const [tripId, stops] of byTrip) {
    if (out.has(tripId)) continue; // real shape already wins
    const ordered = [...stops].sort((x, y) => x.t - y.t);
    const agency = tripAgency.get(tripId);
    const poly: LatLng[] = [];
    for (const s of ordered) {
      const meta = stopFor(s.stopId, agency);
      if (meta) poly.push({ lat: meta.lat, lng: meta.lng });
    }
    if (poly.length >= 2) out.set(tripId, poly);
  }

  return out;
}
