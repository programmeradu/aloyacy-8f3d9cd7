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
  return it;
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
  const keep = (it: Itinerary, tripKey: string) => {
    const prev = out.get(tripKey);
    if (!prev || it.score < prev.score) out.set(tripKey, it);
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
    if (pick.km <= WALK_ONLY_KM) {
      const w = walk(from, pickupPt, ["Start", "Kapnos"]);
      feeders.push({ legs: [w], arrivalUnix: departureUnix + w.durationSec });
    } else {
      const res = await planRaptor(schedule, from, pickupPt, departureUnix, {
        accessibilityPrefs: opts?.accessibilityPrefs,
      });
      for (const it of res.itineraries.slice(0, FEEDERS)) feeders.push({ legs: it.legs, arrivalUnix: it.arrivalUnix });
    }
    const terminal: Pt = { lat: to.lat, lng: to.lng, label: to.label ?? destAirport.name };
    for (const f of feeders) {
      const trip = r.trips.find((t) => t.departUnix + p.offsetSec >= f.arrivalUnix + BOARD_BUFFER_SEC);
      if (!trip) continue;
      const boardUnix = trip.departUnix + p.offsetSec;
      const alightUnix = trip.departUnix + d.offsetSec;
      if (alightUnix <= boardUnix) continue;
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
