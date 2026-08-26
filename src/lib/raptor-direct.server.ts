import type { Itinerary, Leg, RideLeg } from "./itinerary-types";
import type {
  LoadedSchedule,
  ScheduleStop,
  StopTimeRow,
  StopTripRow,
} from "./schedule-loader.server";
import { serviceDateToUnix } from "./schedule-loader.server";
import { pruneDominated } from "@aloya/core/multileg-search";
import {
  finalise,
  walkMetersOnStreet,
  walkSecFromMeters,
  type PlanContext,
} from "@aloya/core/raptor-core";

type CandidateStop = { id: string; stop: ScheduleStop; distKm: number };

function firstTripAtOrAfter(rows: StopTripRow[], deadlineSec: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid][1] < deadlineSec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function firstBoardIndex(rows: StopTimeRow[], stopId: string, deadlineSec: number): number {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === stopId && rows[i][1] >= deadlineSec) return i;
  }
  return -1;
}

type AlightChoice = { idx: number; dest: CandidateStop };

/**
 * Where to get off, judged door to door.
 *
 * Taking the *first* candidate stop the trip happens to touch is what made a
 * one-seat ride look absurd: a bus can clip the edge of the destination area
 * early — two kilometres of walking away — and then run to a stop a hundred
 * metres from the door ten minutes later. So every downstream candidate is
 * evaluated on when the rider actually arrives at the destination, not when
 * the bus reaches some stop with a matching id.
 *
 * Two choices are returned when they differ: the earliest door-to-door
 * arrival, and the one with the least walking. Neither is preferred here —
 * ranking decides, and dominance drops whichever nobody would pick.
 */
function bestDirectAlights(
  rows: StopTimeRow[],
  boardIdx: number,
  directDests: Map<string, CandidateStop>,
): AlightChoice[] {
  let earliest: AlightChoice | null = null;
  let earliestDoorSec = Infinity;
  let shortestWalk: AlightChoice | null = null;
  let shortestWalkKm = Infinity;

  for (let i = boardIdx + 1; i < rows.length; i++) {
    const dest = directDests.get(rows[i][0]);
    if (!dest) continue;
    const doorSec = rows[i][2] + walkSecFromMeters(dest.distKm * 1000);
    if (doorSec < earliestDoorSec) {
      earliestDoorSec = doorSec;
      earliest = { idx: i, dest };
    }
    if (dest.distKm < shortestWalkKm) {
      shortestWalkKm = dest.distKm;
      shortestWalk = { idx: i, dest };
    }
  }

  const out: AlightChoice[] = [];
  if (earliest) out.push(earliest);
  if (shortestWalk && shortestWalk.idx !== earliest?.idx) out.push(shortestWalk);
  return out;
}

export function buildDirectRaptorItineraries(input: {
  schedule: LoadedSchedule;
  origins: CandidateStop[];
  directDests: CandidateStop[];
  planContext?: PlanContext;
  from: { lat: number; lng: number; label?: string };
  to: { lat: number; lng: number; label?: string };
  departureUnix: number;
  searchHorizonSec: number;
  maxJourneySec: number;
}): Itinerary[] {
  const {
    schedule,
    origins,
    directDests,
    from,
    to,
    departureUnix,
    searchHorizonSec,
    maxJourneySec,
    planContext,
  } = input;
  const { date, stops, routes, stopTrips, stopTimes } = schedule;
  const directDestMap = new Map(directDests.map((d) => [d.id, d]));
  const out: Itinerary[] = [];

  for (const origin of origins) {
    const boardStop = stops[origin.id];
    const rows = stopTrips[origin.id];
    if (!boardStop || !rows) continue;

    const accessSec = walkSecFromMeters(origin.distKm * 1000);
    const accessArrivalUnix = departureUnix + accessSec;
    const deadlineSec = accessArrivalUnix - serviceDateToUnix(date, 0);
    const start = firstTripAtOrAfter(rows, deadlineSec);

    for (let i = start; i < rows.length; i++) {
      const [tripId, depSec, routeId] = rows[i];
      if (depSec - deadlineSec > searchHorizonSec) break;
      const tripRows = stopTimes[tripId];
      if (!tripRows) continue;

      const boardIdx = firstBoardIndex(tripRows, origin.id, deadlineSec);
      if (boardIdx < 0) continue;
      const alights = bestDirectAlights(tripRows, boardIdx, directDestMap);
      if (alights.length === 0) continue;

      for (const alight of alights) {
        const boardRow = tripRows[boardIdx];
        const alightRow = tripRows[alight.idx];
        const alightStop = stops[alight.dest.id];
        if (!boardRow || !alightRow || !alightStop) continue;

        const boardUnix = serviceDateToUnix(date, boardRow[1]);
        const arrivalUnix = serviceDateToUnix(date, alightRow[2]);
        if (arrivalUnix - departureUnix > maxJourneySec) continue;

        const routeMeta = routes[routeId];
        const waitSec = boardUnix - accessArrivalUnix;
        const legs: Leg[] = [
          {
            kind: "walk",
            from: { name: from.label ?? "Start", lat: from.lat, lng: from.lng },
            to: { stopId: origin.id, name: boardStop.name, lat: boardStop.lat, lng: boardStop.lng },
            durationSec: accessSec,
            distanceMeters: walkMetersOnStreet(origin.distKm * 1000),
            verified: false,
          },
        ];
        if (waitSec >= 30) {
          legs.push({
            kind: "wait",
            stopId: origin.id,
            name: boardStop.name,
            lat: boardStop.lat,
            lng: boardStop.lng,
            durationSec: waitSec,
          });
        }
        legs.push({
          kind: "ride",
          routeId,
          routeShort: routeMeta?.short ?? "?",
          routeLong: routeMeta?.long ?? "",
          tripId,
          live: false,
          board: {
            stopId: origin.id,
            name: boardStop.name,
            lat: boardStop.lat,
            lng: boardStop.lng,
            departureUnix: boardUnix,
          },
          alight: {
            stopId: alight.dest.id,
            name: alightStop.name,
            lat: alightStop.lat,
            lng: alightStop.lng,
            arrivalUnix,
          },
          stopCount: alightRow[3] - boardRow[3],
          delaySec: 0,
        });
        legs.push({
          kind: "walk",
          from: {
            stopId: alight.dest.id,
            name: alightStop.name,
            lat: alightStop.lat,
            lng: alightStop.lng,
          },
          to: { name: to.label ?? "Destination", lat: to.lat, lng: to.lng },
          durationSec: walkSecFromMeters(alight.dest.distKm * 1000),
          distanceMeters: walkMetersOnStreet(alight.dest.distKm * 1000),
          verified: false,
        });
        out.push(finalise(legs, departureUnix, planContext));
      }
    }
  }

  return out;
}

export function selectRaptorItineraries(itineraries: Itinerary[], limit: number): Itinerary[] {
  const bySignature = new Map<string, Itinerary>();
  for (const it of itineraries) {
    const rides = it.legs.filter((leg): leg is RideLeg => leg.kind === "ride");
    const key = rides.map((r) => `${r.routeId}|${r.board.stopId}|${r.alight.stopId}`).join("→");
    const existing = bySignature.get(key);
    if (!existing || it.score < existing.score) bySignature.set(key, it);
  }
  const kept = pruneDominated([...bySignature.values()]);
  kept.sort((a: Itinerary, b: Itinerary) => a.score - b.score);
  return kept.slice(0, limit);
}
