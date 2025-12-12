// ============================================================
// Wrong-stop adaptive boarding. The Google-Maps-style "you took
// a different turn" behaviour for buses.
//
// While the rider is walking to the planned board stop, watch
// their position. If they end up at a DIFFERENT stop that the
// SAME route serves AND that stop is upstream of (i.e. before)
// the planned alight stop, silently swap the boarding stop and
// surface a friendly HUD note.
//
// If they end up at a stop the planned route does NOT serve, we
// hand off to the existing EarlyAlightSheet / rerouteFromHere
// flow — same buttons, different trigger.
// ============================================================

import routeStops from "@/data/route_stops.json";
import { getStop, distanceKm } from "./gtfs";

type RouteStopsMap = Record<string, string[]>;
const ROUTE_STOPS = routeStops as RouteStopsMap;

const NEAR_M = 80;

export type RerouteHint =
  | {
      kind: "switch-boarding";
      newStopId: string;
      newStopName: string;
      reason: string;
    }
  | {
      kind: "offer-replan";
      detectedNearStopId: string | null;
      reason: string;
    }
  | null;

export function detectWrongStop(args: {
  fixLat: number;
  fixLng: number;
  routeId: string;
  plannedBoardStopId: string;
  plannedAlightStopId: string;
  /** Stops the active trip has already served (skip these). */
  passedStopIds?: Set<string>;
}): RerouteHint {
  const seq = ROUTE_STOPS[args.routeId];
  if (!seq || seq.length < 2) return null;

  const boardIdx = seq.indexOf(args.plannedBoardStopId);
  const alightIdx = seq.indexOf(args.plannedAlightStopId);
  if (boardIdx < 0 || alightIdx < 0) return null;

  // Search the nearest stop within NEAR_M of the rider.
  let nearestId: string | null = null;
  let nearestM = Infinity;
  for (const sid of seq) {
    const s = getStop(sid);
    if (!s) continue;
    const dM = distanceKm({ lat: args.fixLat, lng: args.fixLng }, s) * 1000;
    if (dM < nearestM) {
      nearestM = dM;
      nearestId = sid;
    }
  }
  if (!nearestId || nearestM > NEAR_M) return null;
  if (nearestId === args.plannedBoardStopId) return null;

  const newIdx = seq.indexOf(nearestId);
  const direction = alightIdx > boardIdx ? 1 : -1;
  const validSwap =
    direction > 0 ? newIdx < alightIdx : newIdx > alightIdx;
  const notPassed = !args.passedStopIds?.has(nearestId);

  if (validSwap && notPassed) {
    const stop = getStop(nearestId);
    return {
      kind: "switch-boarding",
      newStopId: nearestId,
      newStopName: stop?.name ?? nearestId,
      reason: "Same bus stops here too — boarding from this stop instead.",
    };
  }

  return {
    kind: "offer-replan",
    detectedNearStopId: nearestId,
    reason: "You're at a different stop. Want me to re-plan from here?",
  };
}
