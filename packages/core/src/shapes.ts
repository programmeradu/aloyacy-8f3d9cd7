/**
 * Lazy loader for compact per-route GTFS shape polylines.
 *
 * Data file: /gtfs-shapes.json   built by scripts/build-shapes (one-off)
 *   { [routeId]: { shapes: { [shapeId]: encodedPolyline }, trips: { [tripId]: shapeId } } }
 *
 * Encoded polylines use the standard Google polyline algorithm (precision 5),
 * which the Google Maps JS SDK can decode for free. We mirror that decode
 * here so map-less consumers (ETA math, route page) don't depend on the SDK.
 */

export type LatLng = { lat: number; lng: number };

type ShapeBundle = {
  shapes: Record<string, string>; // shapeId -> encoded polyline
  trips: Record<string, string>;  // tripId -> shapeId
};
type ShapesIndex = Record<string, ShapeBundle>; // routeId -> bundle

let cache: ShapesIndex | null = null;
let inflight: Promise<ShapesIndex> | null = null;
const decoded = new Map<string, LatLng[]>(); // shapeId -> decoded points

import polyline from "@mapbox/polyline";

/** Decode a Google-encoded polyline (precision 5) into lat/lng pairs. */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded) return [];
  // @mapbox/polyline returns [lat, lng] tuples at precision 5 by default.
  return polyline.decode(encoded).map(([lat, lng]) => ({ lat, lng }));
}

async function loadIndex(): Promise<ShapesIndex> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch("/gtfs-shapes.json", { cache: "force-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => { cache = j as ShapesIndex; return cache!; })
    .catch(() => { cache = {}; return cache!; });
  return inflight;
}

/** Kick off the fetch in the background. Safe to call repeatedly. */
export function prefetchShapes() { void loadIndex(); }

/** Synchronous lookup — returns null until the index has finished loading. */
export function getShapeForTripSync(tripId: string, routeId?: string): LatLng[] | null {
  if (!cache) return null;
  const tryRoute = (rid: string) => {
    const b = cache![rid];
    if (!b) return null;
    const sid = b.trips[tripId];
    if (!sid) return null;
    let pts = decoded.get(sid);
    if (!pts) { pts = decodePolyline(b.shapes[sid] ?? ""); decoded.set(sid, pts); }
    return pts.length >= 2 ? pts : null;
  };
  if (routeId) {
    const hit = tryRoute(routeId);
    if (hit) return hit;
  }
  // Fallback: scan (rare — only when routeId not provided)
  for (const rid of Object.keys(cache)) {
    const hit = tryRoute(rid);
    if (hit) return hit;
  }
  return null;
}

/** Returns the first shape variant for a route (for static route-overview maps). */
export function getAnyShapeForRouteSync(routeId: string): LatLng[] | null {
  if (!cache) return null;
  const b = cache[routeId];
  if (!b) return null;
  const sid = Object.keys(b.shapes)[0];
  if (!sid) return null;
  let pts = decoded.get(sid);
  if (!pts) { pts = decodePolyline(b.shapes[sid]); decoded.set(sid, pts); }
  return pts.length >= 2 ? pts : null;
}

/** Async variant — waits for the index to load. */
export async function getShapeForTrip(tripId: string, routeId?: string): Promise<LatLng[] | null> {
  await loadIndex();
  return getShapeForTripSync(tripId, routeId);
}
