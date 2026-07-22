import { useEffect, useMemo, useState } from "react";
import { buildTripPaths, type LatLng } from "@aloya/core/map-vehicles";
import { getRoute, getStop } from "@/lib/gtfs";
import { getShapeForTripSync, prefetchShapes } from "@/lib/shapes";
import type { RealtimeSnapshot } from "@/lib/gtfs-rt.server";

/**
 * tripId → polyline each bus glides along between feed pings.
 *
 * The shape index loads asynchronously, so the first pass falls back to
 * stop-derived geometry and the memo recomputes into real road shapes once
 * `shapesReady` flips.
 */
export function useTripPaths(rt: RealtimeSnapshot | undefined): Map<string, LatLng[]> {
  useEffect(() => {
    prefetchShapes();
  }, []);

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

  return useMemo(() => {
    if (!rt) return new Map<string, LatLng[]>();
    return buildTripPaths({
      vehicles: rt.vehicles,
      arrivals: rt.arrivals,
      shapeFor: (tripId, routeId) => (shapesReady ? getShapeForTripSync(tripId, routeId) : null),
      stopFor: (stopId, agency) => getStop(stopId, agency),
      agencyForRoute: (routeId) => getRoute(routeId)?.agency,
    });
  }, [rt, shapesReady]);
}
