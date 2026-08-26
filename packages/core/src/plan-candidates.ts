// Choosing which stops a journey may start and end at.
//
// The old rule was "the six nearest stops". At a single-pole roadside stop
// that is fine. At a terminal it is actively wrong: Solomos Square publishes
// five bays, so six slots are spent on one square and the routes that leave
// from the far bay never enter the search — which is exactly how a one-seat
// ride on route 19 got replaced by "take 13, then change to 19 later".
//
// Widening the radius for everyone would be the blunt fix. Instead we keep the
// nearest-N core and then admit a stop only when it adds something real:
//
//   - it is another bay of a station we already selected (same place, so the
//     rider is already standing there), or
//   - it is served by a route no selected stop offers yet.
//
// Both tests are answered from the data we already have — the station index
// built from stop geometry and names, and the route-to-stop map from the feed
// or schedule. A hard cap keeps the search bounded.

export type CandidateStop<S> = { id: string; stop: S; distKm: number };

export type CandidateOptions<S> = {
  /** `[key, stop]` pairs — the key is whatever the caller indexes stops by. */
  stops: Array<[string, S]>;
  point: { lat: number; lng: number };
  /** Straight-line radius, in km. */
  maxKm: number;
  /** Nearest-N always admitted. */
  minCount: number;
  /** Absolute ceiling on the returned list. */
  hardCap: number;
  distanceKm: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  /** Station id for a stop; stops sharing one are the same place. */
  stationOf?: (key: string, stop: S) => string;
  /** Route ids callable at a stop. */
  routesAt?: (key: string, stop: S) => Iterable<string> | undefined;
};

export type CandidateResult<S> = {
  candidates: Array<CandidateStop<S>>;
  /** Nearest stop distance in km, or null when nothing is in range. */
  nearestKm: number | null;
  /** How many were admitted purely because they were another bay. */
  addedForStation: number;
  /** How many were admitted because they served an otherwise-missing route. */
  addedForRoute: number;
};

export function selectCandidateStops<S extends { lat: number; lng: number }>(
  opts: CandidateOptions<S>,
): CandidateResult<S> {
  const { stops, point, maxKm, minCount, hardCap, distanceKm, stationOf, routesAt } = opts;

  const inRange: Array<CandidateStop<S>> = [];
  for (const [id, stop] of stops) {
    // Cheap bounding-box reject before the trigonometry.
    if (Math.abs(stop.lat - point.lat) > maxKm / 100) continue;
    if (Math.abs(stop.lng - point.lng) > maxKm / 85) continue;
    const distKm = distanceKm(point, stop);
    if (distKm > maxKm) continue;
    inRange.push({ id, stop, distKm });
  }
  inRange.sort((a, b) => a.distKm - b.distKm);

  const candidates: Array<CandidateStop<S>> = [];
  const stations = new Set<string>();
  const routes = new Set<string>();
  let addedForStation = 0;
  let addedForRoute = 0;

  for (const cand of inRange) {
    if (candidates.length >= hardCap) break;

    const station = stationOf?.(cand.id, cand.stop);
    const stopRoutes = routesAt?.(cand.id, cand.stop);
    const routeList = stopRoutes ? [...stopRoutes] : [];

    let admit = candidates.length < minCount;
    if (!admit && station !== undefined && stations.has(station)) {
      admit = true;
      addedForStation++;
    }
    if (!admit && routeList.some((r) => !routes.has(r))) {
      admit = true;
      addedForRoute++;
    }
    if (!admit) continue;

    candidates.push(cand);
    if (station !== undefined) stations.add(station);
    for (const r of routeList) routes.add(r);
  }

  return {
    candidates,
    nearestKm: inRange[0]?.distKm ?? null,
    addedForStation,
    addedForRoute,
  };
}

// ---- headways ---------------------------------------------------------------

/**
 * Median gap between consecutive departures of a route at a stop, from the
 * departure times we actually hold. Two departures give one gap, which is
 * still a measurement; fewer gives null and the scorer says so rather than
 * pretending.
 */
export function medianHeadwaySec(departureTimesSec: number[]): number | null {
  if (departureTimesSec.length < 2) return null;
  const sorted = [...departureTimesSec].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 === 1 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/** route id → measured headway, from a flat list of (routeId, departure). */
export function buildHeadwayIndex(
  departures: Array<{ routeId: string; departureSec: number }>,
): Map<string, number> {
  const byRoute = new Map<string, number[]>();
  for (const d of departures) {
    const list = byRoute.get(d.routeId);
    if (list) list.push(d.departureSec);
    else byRoute.set(d.routeId, [d.departureSec]);
  }
  const out = new Map<string, number>();
  for (const [routeId, times] of byRoute) {
    const headway = medianHeadwaySec(times);
    if (headway !== null) out.set(routeId, headway);
  }
  return out;
}
