// Kapnos Airport Shuttle as a planned, ranked itinerary.
//
// Kapnos is the coach most people actually take between Nicosia and the
// airports: one stop per city, hourly in the day, 45 minutes Nicosia to
// Larnaca Airport. The trip screen used to show it only as a side card, so the
// ranked list could put a four-change bus marathon on top while a coach from
// Nicosia would have had the rider at the terminal an hour earlier. Here the
// coach becomes a ride leg like any other: the timetable planner finds the bus
// (or walk) to the Kapnos stop, the first coach the rider can catch, and the
// walk at the far end, and the result is ranked with everything else.
//
// Pure and client-safe. The Worker only serves the coach timetable
// (kapnos.functions.ts `getKapnosAirportRoutes`); the search runs here.

import type { LoadedSchedule } from "./schedule-types";
import type { Itinerary, Leg, RideLeg, WalkLeg } from "./itinerary-types";
import { finalise, walkMetersOnStreet, walkSecFromMeters } from "@aloya/core/raptor-core";
import { rankPenaltySec } from "@aloya/core/plan-score";
import type { AccessibilityPrefs } from "@aloya/core/raptor-core";
import { airportFor, kmBetween, snapToAirport, type Airport } from "./plan-airports";
import { planRaptor } from "./raptor-plan";

export type KapnosClientStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isAirport: boolean;
  /** Seconds after the coach leaves its first stop. */
  offsetSec: number;
};

export type KapnosClientRoute = {
  id: string;
  code: string;
  name: string;
  pickups: KapnosClientStop[];
  dropoffs: KapnosClientStop[];
  /** Upcoming departures from the first stop, unix seconds, ascending. */
  trips: Array<{ tripId: string; departUnix: number; price: string }>;
};

/** Close enough to the coach stop to just walk there. */
const WALK_ONLY_KM = 1.1;
/** Be at the coach stop this long before it leaves. */
const BOARD_BUFFER_SEC = 5 * 60;
/** A city coach stop further than this from the rider is not their coach. */
const MAX_FEEDER_KM = 40;
/** An airport-side Kapnos stop must be this close to the terminal. */
const AIRPORT_SIDE_KM = 1.5;
/** Feeder options tried per coach stop. */
const FEEDERS = 3;
/**
 * A walk this short (straight line) to the coach stop is offered as a feeder
 * even when a bus also goes there, and beats a bus hop to the same coach.
 */
const WALK_FEEDER_KM = 1.6;
/** Feeder arriving this long before the coach is planned again from later. */
const LATE_FEEDER_GAP_SEC = 20 * 60;

type Pt = { lat: number; lng: number; label?: string };

export function cleanKapnosName(name: string): string {
  return name.replace(/^\([A-Z]\d+\)\s*/, "").trim();
}

function walk(from: Pt & { stopId?: string }, to: Pt & { stopId?: string }, fallback: [string, string]): WalkLeg {
  const m = kmBetween(from, to) * 1000;
  return {
    kind: "walk",
    from: { ...(from.stopId ? { stopId: from.stopId } : {}), name: from.label ?? fallback[0], lat: from.lat, lng: from.lng },
    to: { ...(to.stopId ? { stopId: to.stopId } : {}), name: to.label ?? fallback[1], lat: to.lat, lng: to.lng },
    durationSec: walkSecFromMeters(m),
    distanceMeters: walkMetersOnStreet(m),
    verified: false,
  };
}

function coachLeg(
  route: KapnosClientRoute,
  trip: { tripId: string; price: string },
  board: KapnosClientStop,
  alight: KapnosClientStop,
  boardUnix: number,
  alightUnix: number,
): RideLeg {
  return {
    kind: "ride",
    routeId: `kapnos:${route.code}`,
    routeShort: "Kapnos",
    routeLong: `Kapnos Airport Shuttle · ${route.name}${trip.price ? ` · ${trip.price}` : ""}`,
    tripId: `kapnos:${trip.tripId}`,
    live: false,
    board: {
      stopId: `kapnos:${board.id}`,
      name: cleanKapnosName(board.name),
      lat: board.lat,
      lng: board.lng,
      departureUnix: boardUnix,
    },
    alight: {
      stopId: `kapnos:${alight.id}`,
      name: cleanKapnosName(alight.name),
      lat: alight.lat,
      lng: alight.lng,
      arrivalUnix: alightUnix,
    },
    stopCount: 1,
    delaySec: 0,
  };
}

function waitAt(stop: KapnosClientStop, sec: number): Leg[] {
  if (sec < 30) return [];
  return [
    { kind: "wait", stopId: `kapnos:${stop.id}`, name: cleanKapnosName(stop.name), lat: stop.lat, lng: stop.lng, durationSec: sec },
  ];
}

function done(legs: Leg[], departureUnix: number, tripId: string): Itinerary {
  const it = finalise(legs, departureUnix);
  it.id = `kapnos-${tripId}-${departureUnix}`;
  it.source = "estimated";
  it.score += rankPenaltySec(it);
  // Re-based on leaving time by the caller, after the Worker verifies the
  // walks (a re-based option has no slack left for a longer verified walk).
  return it;
}

function rideCount(legs: Leg[]): number {
  return legs.filter((l) => l.kind === "ride").length;
}

/** When the rider sets off: first boarding minus the walks before it. */
function leaveTime(legs: Leg[], fallback: number): number {
  const i = legs.findIndex((l) => l.kind === "ride");
  if (i < 0) return fallback;
  let walkSec = 0;
  for (let k = 0; k < i; k++) {
    const l = legs[k];
    if (l.kind === "walk") walkSec += l.durationSec;
  }
  return (legs[i] as RideLeg).board.departureUnix - walkSec;
}

/**
 * The feeder with its last bus swapped for a walk, when the previous bus drops
 * the rider within a short walk of the coach stop (ride to Solomou, then walk,
 * rather than a 4 min hop). Null when there is no such shortcut.
 */
function trimLastHop(
  legs: Leg[],
  pickup: Pt & { stopId: string },
): { legs: Leg[]; arrivalUnix: number } | null {
  const rideIdx = legs.map((l, i) => (l.kind === "ride" ? i : -1)).filter((i) => i >= 0);
  if (rideIdx.length < 2) return null;
  const prevIdx = rideIdx[rideIdx.length - 2];
  const prev = legs[prevIdx] as RideLeg;
  if (kmBetween(prev.alight, pickup) > WALK_FEEDER_KM) return null;
  const head = legs.slice(0, prevIdx + 1);
  const w = walk(
    { lat: prev.alight.lat, lng: prev.alight.lng, label: prev.alight.name, stopId: prev.alight.stopId },
    pickup,
    ["Stop", "Kapnos"],
  );
  return { legs: [...head, w], arrivalUnix: prev.alight.arrivalUnix + w.durationSec };
}

function nearestAirportSide(stops: KapnosClientStop[], airport: Airport): KapnosClientStop | null {
  let best: KapnosClientStop | null = null;
  let bestKm = Infinity;
  for (const s of stops) {
    if (!s.isAirport) continue;
    const d = kmBetween(s, airport);
    if (d <= AIRPORT_SIDE_KM && d < bestKm) {
      best = s;
      bestKm = d;
    }
  }
  return best;
}

/**
 * Kapnos itineraries for a trip to or from an airport, door to door, ready to
 * rank. Empty when neither end is an airport or no coach fits.
 */
export async function planKapnosItineraries(
  schedule: LoadedSchedule,
  from: Pt,
  to: Pt,
  departureUnix: number,
  routes: KapnosClientRoute[],
  opts?: { accessibilityPrefs?: AccessibilityPrefs },
): Promise<Itinerary[]> {
  const destAirport = airportFor(to);
  const originAirport = airportFor(from);
  if (!destAirport === !originAirport) return [];
  // The airport end is the terminal, wherever the pin landed.
  to = snapToAirport(to).point;
  from = snapToAirport(from).point;
  const out = new Map<string, Itinerary>();
  // One option per coach departure. For the same coach the feeder with fewer
  // rides wins (walk to the stop rather than hop on a bus), then the one that
  // leaves later, then the better score.
  const keep = (it: Itinerary, tripKey: string) => {
    const prev = out.get(tripKey);
    if (!prev) return void out.set(tripKey, it);
    const dr = rideCount(it.legs) - rideCount(prev.legs);
    if (dr < 0) return void out.set(tripKey, it);
    if (dr > 0) return;
    const dl = leaveTime(it.legs, it.departureUnix) - leaveTime(prev.legs, prev.departureUnix);
    if (dl > 60 || (Math.abs(dl) <= 60 && it.score < prev.score)) out.set(tripKey, it);
  };

  if (destAirport) {
    // City → airport: the coach stop nearest the rider on a route that ends
    // at this airport's terminal.
    let pick: { r: KapnosClientRoute; p: KapnosClientStop; d: KapnosClientStop; km: number } | null = null;
    for (const r of routes) {
      const d = nearestAirportSide(r.dropoffs, destAirport);
      if (!d) continue;
      for (const p of r.pickups) {
        if (p.isAirport || p.offsetSec >= d.offsetSec) continue;
        const km = kmBetween(from, p);
        if (km > MAX_FEEDER_KM) continue;
        if (!pick || km < pick.km) pick = { r, p, d, km };
      }
    }
    if (!pick) return [];
    const { r, p, d } = pick;
    const pickupPt: Pt & { stopId: string } = { lat: p.lat, lng: p.lng, label: cleanKapnosName(p.name), stopId: `kapnos:${p.id}` };
    const feeders: Array<{ legs: Leg[]; arrivalUnix: number }> = [];
    // Walking to the coach stop is a feeder whenever it is short, alongside
    // any bus: a 4 min hop that saves a 15 min walk is not worth the change.
    if (pick.km <= WALK_FEEDER_KM) {
      const w = walk(from, pickupPt, ["Start", "Kapnos"]);
      feeders.push({ legs: [w], arrivalUnix: departureUnix + w.durationSec });
    }
    const raptorFeeders = async (start: number) => {
      const res = await planRaptor(schedule, from, pickupPt, start, {
        accessibilityPrefs: opts?.accessibilityPrefs,
      });
      return res.itineraries
        .filter((it) => it.legs.some((l) => l.kind === "ride"))
        .map((it) => ({ legs: it.legs, arrivalUnix: it.arrivalUnix }));
    };
    if (pick.km > WALK_ONLY_KM) {
      for (const f of (await raptorFeeders(departureUnix)).slice(0, FEEDERS)) {
        feeders.push(f);
        const trimmed = trimLastHop(f.legs, pickupPt);
        if (trimmed) feeders.push(trimmed);
      }
    }
    const terminal: Pt = { lat: to.lat, lng: to.lng, label: to.label ?? destAirport.name };
    for (const f0 of feeders) {
      let f = f0;
      const trip = r.trips.find((t) => t.departUnix + p.offsetSec >= f.arrivalUnix + BOARD_BUFFER_SEC);
      if (!trip) continue;
      const boardUnix = trip.departUnix + p.offsetSec;
      const alightUnix = trip.departUnix + d.offsetSec;
      if (alightUnix <= boardUnix) continue;
      // A bus feeder that gets there long before the coach (a 4 min hop, then
      // three hours at the stop) is planned again so the rider leaves later
      // and arrives shortly before the coach.
      if (boardUnix - f.arrivalUnix > LATE_FEEDER_GAP_SEC && f.legs.some((l) => l.kind === "ride")) {
        const travel = f.arrivalUnix - leaveTime(f.legs, departureUnix);
        const lateStart = Math.max(departureUnix, boardUnix - BOARD_BUFFER_SEC - travel - 15 * 60);
        // Sparse feeders (an intercity every hour or two): step the search
        // back until one gets there in time, never earlier than the original.
        for (let back = 0; back <= 3 * 3600; back += 45 * 60) {
          const start = lateStart - back;
          if (start <= departureUnix + 10 * 60) break;
          const later = (await raptorFeeders(start))
            .filter((x) => x.arrivalUnix + BOARD_BUFFER_SEC <= boardUnix)
            .sort((a, b) => b.arrivalUnix - a.arrivalUnix || rideCount(a.legs) - rideCount(b.legs))[0];
          if (later && later.arrivalUnix > f.arrivalUnix + 10 * 60) {
            f = later;
            break;
          }
        }
      }
      const legs: Leg[] = [
        ...f.legs,
        ...waitAt(p, boardUnix - f.arrivalUnix),
        coachLeg(r, trip, p, d, boardUnix, alightUnix),
        walk({ lat: d.lat, lng: d.lng, label: cleanKapnosName(d.name), stopId: `kapnos:${d.id}` }, terminal, ["Kapnos", "Destination"]),
      ];
      keep(done(legs, departureUnix, trip.tripId), trip.tripId);
    }
    return [...out.values()];
  }

  // Airport → city: the coach from this terminal whose city stop is nearest
  // the destination, then the bus (or walk) from there.
  const airport = originAirport as Airport;
  let pick: { r: KapnosClientRoute; p: KapnosClientStop; d: KapnosClientStop; km: number } | null = null;
  for (const r of routes) {
    const p = nearestAirportSide(r.pickups, airport);
    if (!p) continue;
    for (const d of r.dropoffs) {
      if (d.isAirport || d.offsetSec <= p.offsetSec) continue;
      const km = kmBetween(to, d);
      if (km > MAX_FEEDER_KM) continue;
      if (!pick || km < pick.km) pick = { r, p, d, km };
    }
  }
  if (!pick) return [];
  const { r, p, d } = pick;
  const startWalk = walk(from, { lat: p.lat, lng: p.lng, label: cleanKapnosName(p.name), stopId: `kapnos:${p.id}` }, ["Start", "Kapnos"]);
  const atStop = departureUnix + startWalk.durationSec;
  const trips = r.trips.filter((t) => t.departUnix + p.offsetSec >= atStop + 60).slice(0, 2);
  const dropPt: Pt & { stopId: string } = { lat: d.lat, lng: d.lng, label: cleanKapnosName(d.name), stopId: `kapnos:${d.id}` };
  for (const trip of trips) {
    // One coach option is enough (the merge keeps only the best); the next
    // departure is tried only when no onward connection fits the first.
    if (out.size > 0) break;
    const boardUnix = trip.departUnix + p.offsetSec;
    const alightUnix = trip.departUnix + d.offsetSec;
    const head: Leg[] = [startWalk, ...waitAt(p, boardUnix - atStop), coachLeg(r, trip, p, d, boardUnix, alightUnix)];
    if (pick.km <= WALK_ONLY_KM) {
      keep(done([...head, walk(dropPt, to, ["Kapnos", "Destination"])], departureUnix, trip.tripId), trip.tripId);
      continue;
    }
    const res = await planRaptor(schedule, dropPt, to, alightUnix + 120, {
      accessibilityPrefs: opts?.accessibilityPrefs,
    });
    const onward = res.itineraries[0];
    if (!onward) continue;
    keep(done([...head, ...onward.legs], departureUnix, trip.tripId), trip.tripId);
  }
  return [...out.values()];
}
