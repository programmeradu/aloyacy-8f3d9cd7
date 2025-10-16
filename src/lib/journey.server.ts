// Door-to-door journey planner.
// Composes: walking from origin → boarding stop, the bus segment (using LIVE
// trip data to guarantee a real upcoming vehicle serves both stops), then
// walking from alighting stop → destination.

import { fetchRealtime } from "./gtfs-rt.server";
import { STOPS, ROUTES, distanceKm } from "./gtfs";
import { walkingRoute } from "./maps.server";

const WALK_M_PER_S = 1.35; // average urban walking pace
const MAX_WALK_KM = 1.2;
const TOP_STOPS = 6;

export type JourneyLeg =
  | {
      kind: "walk";
      from: { lat: number; lng: number; label: string };
      to: { lat: number; lng: number; label: string };
      durationSec: number;
      distanceMeters: number;
    }
  | {
      kind: "bus";
      routeId: string;
      routeShort: string;
      routeLong: string;
      tripId: string;
      board: { stopId: string; name: string; departureUnix: number };
      alight: { stopId: string; name: string; arrivalUnix: number };
      delaySec: number;
    };

export type JourneyOption = {
  id: string;
  totalDurationSec: number;
  departureUnix: number;
  arrivalUnix: number;
  legs: JourneyLeg[];
  transfers: number;
};

function walkSecondsFallback(km: number) {
  return Math.round((km * 1000) / WALK_M_PER_S);
}

export async function planJourney(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
): Promise<JourneyOption[]> {
  const now = Math.floor(Date.now() / 1000);

  // 1. Candidate boarding / alighting stops within walking radius.
  const originStops = STOPS.map((s) => ({
    ...s,
    distanceKm: distanceKm(from, s),
  }))
    .filter((s) => s.distanceKm <= MAX_WALK_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, TOP_STOPS);

  const destStops = STOPS.map((s) => ({
    ...s,
    distanceKm: distanceKm(to, s),
  }))
    .filter((s) => s.distanceKm <= MAX_WALK_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, TOP_STOPS);

  if (originStops.length === 0 || destStops.length === 0) return [];

  const originIds = new Set(originStops.map((s) => s.id));
  const destIds = new Set(destStops.map((s) => s.id));

  // 2. Pull live feed and index arrivals by trip.
  const rt = await fetchRealtime();
  const byTrip = new Map<
    string,
    {
      routeId: string;
      stops: { stopId: string; arrivalUnix: number; delaySec: number }[];
    }
  >();
  for (const a of rt.arrivals) {
    if (a.arrivalUnix < now - 60) continue;
    const cur = byTrip.get(a.tripId) ?? {
      routeId: a.routeId,
      stops: [],
    };
    cur.stops.push({
      stopId: a.stopId,
      arrivalUnix: a.arrivalUnix,
      delaySec: a.delaySec,
    });
    byTrip.set(a.tripId, cur);
  }

  const routeById = new Map(ROUTES.map((r) => [r.id, r]));
  const stopById = new Map(STOPS.map((s) => [s.id, s]));

  // 3. For each trip that touches both an origin and a destination stop in
  //    that order, compose a candidate.
  const candidates: JourneyOption[] = [];

  for (const [tripId, trip] of byTrip) {
    const ordered = [...trip.stops].sort((a, b) => a.arrivalUnix - b.arrivalUnix);
    const boardIdx = ordered.findIndex((s) => originIds.has(s.stopId));
    if (boardIdx === -1) continue;
    const alightIdx = ordered.findIndex(
      (s, i) => i > boardIdx && destIds.has(s.stopId),
    );
    if (alightIdx === -1) continue;

    const board = ordered[boardIdx];
    const alight = ordered[alightIdx];
    const boardStop = stopById.get(board.stopId);
    const alightStop = stopById.get(alight.stopId);
    if (!boardStop || !alightStop) continue;
    const route = routeById.get(trip.routeId);

    const walkAKm = distanceKm(from, boardStop);
    const walkBKm = distanceKm(alightStop, to);
    const walkASec = walkSecondsFallback(walkAKm);
    const walkBSec = walkSecondsFallback(walkBKm);
    const waitSec = Math.max(0, board.arrivalUnix - now - walkASec);

    // Skip if we'd miss it
    if (board.arrivalUnix - now < walkASec - 60) continue;

    const departureUnix = now + walkASec + waitSec;
    const arrivalUnix = alight.arrivalUnix + walkBSec;
    const totalDurationSec = arrivalUnix - now;

    candidates.push({
      id: `${tripId}-${board.stopId}-${alight.stopId}`,
      totalDurationSec,
      departureUnix,
      arrivalUnix,
      transfers: 0,
      legs: [
        {
          kind: "walk",
          from: { lat: from.lat, lng: from.lng, label: from.label ?? "Origin" },
          to: { lat: boardStop.lat, lng: boardStop.lng, label: boardStop.name },
          durationSec: walkASec,
          distanceMeters: Math.round(walkAKm * 1000),
        },
        {
          kind: "bus",
          routeId: trip.routeId,
          routeShort: route?.short ?? "?",
          routeLong: route?.long ?? "Route",
          tripId,
          board: {
            stopId: boardStop.id,
            name: boardStop.name,
            departureUnix: board.arrivalUnix,
          },
          alight: {
            stopId: alightStop.id,
            name: alightStop.name,
            arrivalUnix: alight.arrivalUnix,
          },
          delaySec: board.delaySec,
        },
        {
          kind: "walk",
          from: { lat: alightStop.lat, lng: alightStop.lng, label: alightStop.name },
          to: { lat: to.lat, lng: to.lng, label: to.label ?? "Destination" },
          durationSec: walkBSec,
          distanceMeters: Math.round(walkBKm * 1000),
        },
      ],
    });
  }

  // 4. Dedupe per route — keep the soonest departure for each route id.
  const bestPerRoute = new Map<string, JourneyOption>();
  for (const c of candidates) {
    const bus = c.legs.find((l) => l.kind === "bus");
    if (!bus || bus.kind !== "bus") continue;
    const key = `${bus.routeId}-${bus.board.stopId}-${bus.alight.stopId}`;
    const existing = bestPerRoute.get(key);
    if (!existing || c.departureUnix < existing.departureUnix) {
      bestPerRoute.set(key, c);
    }
  }

  const top = [...bestPerRoute.values()]
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
    .slice(0, 4);

  // 5. Upgrade the walking legs of the top picks with real Google walking
  //    geometry (fire-and-forget — fallback already in place).
  await Promise.all(
    top.map(async (opt) => {
      for (const leg of opt.legs) {
        if (leg.kind !== "walk") continue;
        const real = await walkingRoute(
          { lat: leg.from.lat, lng: leg.from.lng },
          { lat: leg.to.lat, lng: leg.to.lng },
        );
        if (real) {
          leg.durationSec = real.durationSec;
          leg.distanceMeters = real.distanceMeters;
        }
      }
      const first = opt.legs[0];
      const last = opt.legs[opt.legs.length - 1];
      const bus = opt.legs.find((l) => l.kind === "bus");
      if (first?.kind === "walk" && last?.kind === "walk" && bus?.kind === "bus") {
        const waitSec = Math.max(
          0,
          bus.board.departureUnix - now - first.durationSec,
        );
        opt.departureUnix = now + first.durationSec + waitSec;
        opt.arrivalUnix = bus.alight.arrivalUnix + last.durationSec;
        opt.totalDurationSec = opt.arrivalUnix - now;
      }
    }),
  );

  return top.sort((a, b) => a.arrivalUnix - b.arrivalUnix);
}
