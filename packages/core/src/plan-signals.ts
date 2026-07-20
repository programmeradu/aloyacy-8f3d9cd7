// Pure planning signals: everything the trip screen derives from a share link
// or from an itinerary, with no React, network or browser APIs in sight.
//
// The trip route used to compute all of this inline, which meant none of it
// could be tested without rendering a 1,000-line component and mocking Maps.

import type { Itinerary, WalkLeg } from "./itinerary-types";

export type PlanPoint = { lat: number; lng: number; label: string };

export type SharedPlan = {
  origin: PlanPoint | null;
  destination: PlanPoint;
  /** ISO departure lifted from `dep`, only when it is still plannable. */
  leaveByISO: string | null;
  /** Which field the picker should open on — origin is missing on group links. */
  focus: "from" | null;
};

function num(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function point(sp: URLSearchParams, prefix: "from" | "to"): PlanPoint | null {
  const lat = num(sp.get(`${prefix}Lat`));
  const lng = num(sp.get(`${prefix}Lng`));
  const label = (sp.get(`${prefix}Label`) ?? "").trim();
  if (lat == null || lng == null || !label) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng, label };
}

/**
 * Hydrate "Open this plan in Aloya" deep links.
 *
 * Returns null when there is no usable destination — a link with only an
 * origin, or with junk coordinates, must leave the screen untouched rather
 * than half-fill it.
 */
export function parseSharedPlan(
  search: string,
  nowMs: number,
  /** Grace window: a departure that just passed is still worth honouring. */
  graceMs = 60_000,
): SharedPlan | null {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const destination = point(sp, "to");
  if (!destination) return null;
  const origin = point(sp, "from");

  let leaveByISO: string | null = null;
  const dep = num(sp.get("dep"));
  // A stale `dep` from a link opened the next morning would plan an empty
  // yesterday; falling back to "leave now" is kinder than showing nothing.
  if (origin && dep != null && dep > 0 && dep * 1000 > nowMs - graceMs) {
    leaveByISO = new Date(dep * 1000).toISOString();
  }

  return { origin, destination, leaveByISO, focus: origin ? null : "from" };
}

/** Metres the rider walks before their first ride; 0 when they board at the door. */
export function accessWalkMeters(itinerary: Itinerary | null | undefined): number | null {
  if (!itinerary) return null;
  const firstWalk = itinerary.legs.find((l) => l.kind === "walk");
  return firstWalk && firstWalk.kind === "walk" ? Math.round(firstWalk.distanceMeters) : 0;
}

export type EgressWalk = {
  walkMeters: number;
  alight: { lat: number; lng: number; name: string };
};

/**
 * The final walk *after* a ride — the leg a taxi handoff could replace.
 * A walk-only itinerary has no egress leg: there is no bus to hand off from.
 */
export function egressWalk(itinerary: Itinerary | null | undefined): EgressWalk | null {
  if (!itinerary) return null;
  const legs = itinerary.legs;
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i];
    if (leg.kind !== "walk") continue;
    if (!legs.slice(0, i).some((p) => p.kind === "ride")) return null;
    const walk = leg as WalkLeg;
    return {
      walkMeters: Math.round(walk.distanceMeters),
      alight: { lat: walk.from.lat, lng: walk.from.lng, name: walk.from.name },
    };
  }
  return null;
}

/** Below this a taxi handoff is never worth suggesting — the walk is fine. */
export const EGRESS_TAXI_MIN_METERS = 800;

/** Every point worth checking against the road-incident feed. */
export function itineraryTrafficPoints(
  itinerary: Itinerary | null | undefined,
): Array<{ lat: number; lng: number }> {
  if (!itinerary) return [];
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const leg of itinerary.legs) {
    if (leg.kind === "ride") {
      pts.push({ lat: leg.board.lat, lng: leg.board.lng });
      pts.push({ lat: leg.alight.lat, lng: leg.alight.lng });
    } else if (leg.kind === "walk") {
      pts.push({ lat: leg.from.lat, lng: leg.from.lng });
      pts.push({ lat: leg.to.lat, lng: leg.to.lng });
    }
  }
  return pts;
}

/** Cache key that ignores sub-100 m jitter so a re-plan doesn't refetch alerts. */
export function trafficPointsKey(points: Array<{ lat: number; lng: number }>): string {
  return points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|");
}

/** Farther than this from a Kapnos coach stop and we plan a bus, not a walk. */
export const KAPNOS_WALKABLE_M = 1_200;

/**
 * When to re-plan because the recommended bus has pulled away. Returns null
 * when there is nothing to wait for, 0 when it already left, otherwise the
 * delay in ms (capped so a trip planned for tomorrow still polls normally).
 */
export function msUntilReplan(
  itinerary: Itinerary | null | undefined,
  nowMs: number,
  settleMs = 5_000,
  capMs = 60_000,
): number | null {
  const ride = itinerary?.legs.find((l) => l.kind === "ride");
  if (!ride || ride.kind !== "ride") return null;
  const until = ride.board.departureUnix * 1000 - nowMs;
  if (until <= 0) return 0;
  return Math.min(until + settleMs, capMs);
}
