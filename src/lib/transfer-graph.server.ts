// Transfer graph — Phase 1 foundation for the multi-leg planner.
//
// Two in-memory indexes, built lazily on first use and cached for the
// lifetime of the server worker:
//
//   1. stopRoutes      — Map<stopId, Set<routeId>> — every route serving a stop.
//   2. transferCandidates — Map<stopId, TransferCandidate[]> — nearby stops
//      (≤ 400 m straight-line) served by a DIFFERENT route than the origin.
//
// These are the static skeleton of the search graph. They do not call out
// to Google Directions — that happens lazily inside walk-links.server.ts
// when the search needs to score an actual walking edge.
//
// Constraints (mirror the approved plan, Phase 1):
//   - 400 m radius for transfer candidates
//   - max 8 candidates per stop (sorted by distance, ascending)
//   - candidate must be served by a route the origin stop is NOT served by

import { STOPS, ROUTES, distanceKm } from "./gtfs";
import ROUTE_STOPS from "../data/route_stops.json";

const TRANSFER_RADIUS_M = 400;
const MAX_CANDIDATES_PER_STOP = 8;

// The bundled route_stops snapshot is missing the Larnaca airport feeders,
// which prevents the transfer graph from discovering the normal handoff from
// Intercity route 42 into the airport buses around Larnaca Station/Foinikoudes.
// This fallback is intentionally small and only restores the served-stop facts
// the transfer graph needs for airport transfers.
const FALLBACK_ROUTE_STOPS: Record<string, string[]> = {
  "20150011": ["6867", "6733", "6734", "6102", "6115", "6116", "6117"],
  "20150012": ["6117", "6115", "6116", "6102", "6733", "6734", "6867"],
  "20150021": ["6867", "6733", "6734", "6115", "6116", "6117"],
  "20190011": ["6867", "6115", "6116", "6117"],
  "20190012": ["6117", "6115", "6116", "6867"],
  "20000011": ["6867", "6733", "6734", "6115", "6116", "6117", "6456", "6463"],
  "20000012": ["6456", "6463", "6117", "6115", "6116", "6867"],
  "20060011": ["6867", "6733", "6734", "6115", "6116", "6117", "6456", "6463"],
  "20060012": ["6456", "6463", "6117", "6115", "6116", "6867"],
};

export type TransferCandidate = {
  toStopId: string;
  straightLineMeters: number;
  /** Routes serving the candidate stop that do NOT serve the origin stop. */
  newRoutes: string[];
};

let _stopRoutes: Map<string, Set<string>> | null = null;
let _transferCandidates: Map<string, TransferCandidate[]> | null = null;

const KNOWN_ROUTE_IDS = new Set(ROUTES.map((r) => r.id));

/**
 * stopRoutes: every route serving a stop. Built from route_stops.json and
 * filtered to routes we recognise (skips orphaned ids from the GTFS feed).
 */
export function getStopRoutes(): Map<string, Set<string>> {
  if (_stopRoutes) return _stopRoutes;

  const m = new Map<string, Set<string>>();
  const raw = {
    ...(ROUTE_STOPS as Record<string, string[]>),
    ...FALLBACK_ROUTE_STOPS,
  };

  for (const [routeId, stopIds] of Object.entries(raw)) {
    if (!KNOWN_ROUTE_IDS.has(routeId)) continue;
    for (const stopId of stopIds) {
      let set = m.get(stopId);
      if (!set) {
        set = new Set();
        m.set(stopId, set);
      }
      set.add(routeId);
    }
  }

  _stopRoutes = m;
  return m;
}

/**
 * For every stop, the nearby stops worth considering as a transfer point.
 * Filtered so we never propose "transfer" between two stops on the exact
 * same set of routes (that's not a transfer, that's noise).
 *
 * Pure O(stops^2) at worst — acceptable for Cyprus' ~5k stops, runs once
 * per worker cold-start, and uses early-exit on the cheap distance check.
 */
export function getTransferCandidates(): Map<string, TransferCandidate[]> {
  if (_transferCandidates) return _transferCandidates;

  const stopRoutes = getStopRoutes();
  const out = new Map<string, TransferCandidate[]>();

  // Pre-index stops with at least one known route for the outer loop.
  const servedStops = STOPS.filter((s) => stopRoutes.has(s.id));

  for (const origin of servedStops) {
    const originRoutes = stopRoutes.get(origin.id)!;
    const candidates: TransferCandidate[] = [];

    for (const other of servedStops) {
      if (other.id === origin.id) continue;
      // Cheap bounding-box prefilter before the haversine call.
      // 400 m ~= 0.0036° lat, ~0.0044° lng at Cyprus latitudes; use 0.006° as a safe box.
      if (Math.abs(other.lat - origin.lat) > 0.006) continue;
      if (Math.abs(other.lng - origin.lng) > 0.006) continue;

      const km = distanceKm(origin, other);
      const meters = km * 1000;
      if (meters > TRANSFER_RADIUS_M) continue;

      const otherRoutes = stopRoutes.get(other.id)!;
      const newRoutes: string[] = [];
      for (const r of otherRoutes) {
        if (!originRoutes.has(r)) newRoutes.push(r);
      }
      if (newRoutes.length === 0) continue; // not a useful transfer

      candidates.push({
        toStopId: other.id,
        straightLineMeters: Math.round(meters),
        newRoutes,
      });
    }

    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.straightLineMeters - b.straightLineMeters);
    out.set(origin.id, candidates.slice(0, MAX_CANDIDATES_PER_STOP));
  }

  _transferCandidates = out;
  return out;
}

/**
 * Convenience: for a given stop, the set of distinct routes reachable by a
 * single transfer (1-hop). Useful for quickly pruning multi-leg searches
 * before running the full algorithm.
 */
export function getReachableRoutesViaTransfer(stopId: string): Set<string> {
  const candidates = getTransferCandidates().get(stopId) ?? [];
  const routes = new Set<string>();
  for (const c of candidates) for (const r of c.newRoutes) routes.add(r);
  return routes;
}

/** Diagnostics — useful for the Phase 1 checkpoint. */
export function getGraphStats() {
  const sr = getStopRoutes();
  const tc = getTransferCandidates();
  let totalCandidates = 0;
  for (const list of tc.values()) totalCandidates += list.length;
  return {
    stopsWithRoutes: sr.size,
    stopsWithTransferCandidates: tc.size,
    totalTransferCandidatePairs: totalCandidates,
    avgCandidatesPerStop:
      tc.size === 0 ? 0 : Math.round((totalCandidates / tc.size) * 10) / 10,
  };
}
