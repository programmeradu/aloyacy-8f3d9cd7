import type { Itinerary, Leg, RideLeg } from "./itinerary-types";
import type { LoadedSchedule, ScheduleStop, StopTimeRow, StopTripRow } from "./schedule-loader.server";
import { serviceDateToUnix } from "./schedule-loader.server";
import { applyDirectPreference } from "@aloya/core/multileg-search";
import { finalise, walkMetersOnStreet, walkSecFromMeters } from "@aloya/core/raptor-core";

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

function firstDirectAlight(
  rows: StopTimeRow[],
  boardIdx: number,
  directDests: Map<string, CandidateStop>,
): { idx: number; dest: CandidateStop } | null {
  for (let i = boardIdx + 1; i < rows.length; i++) {
    const dest = directDests.get(rows[i][0]);
    if (dest) return { idx: i, dest };
  }
  return null;
}

export function buildDirectRaptorItineraries(input: {
  schedule: LoadedSchedule;
  origins: CandidateStop[];
  directDests: CandidateStop[];
  from: { lat: number; lng: number; label?: string };
  to: { lat: number; lng: number; label?: string };
  departureUnix: number;
  searchHorizonSec: number;
  maxJourneySec: number;
}): Itinerary[] {
  const { schedule, origins, directDests, from, to, departureUnix, searchHorizonSec, maxJourneySec } = input;
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
      const alight = firstDirectAlight(tripRows, boardIdx, directDestMap);
      if (!alight) continue;

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
        legs.push({ kind: "wait", stopId: origin.id, name: boardStop.name, lat: boardStop.lat, lng: boardStop.lng, durationSec: waitSec });
      }
      legs.push({
        kind: "ride",
        routeId,
        routeShort: routeMeta?.short ?? "?",
        routeLong: routeMeta?.long ?? "",
        tripId,
        live: false,
        board: { stopId: origin.id, name: boardStop.name, lat: boardStop.lat, lng: boardStop.lng, departureUnix: boardUnix },
        alight: { stopId: alight.dest.id, name: alightStop.name, lat: alightStop.lat, lng: alightStop.lng, arrivalUnix },
        stopCount: alightRow[3] - boardRow[3],
        delaySec: 0,
      });
      legs.push({
        kind: "walk",
        from: { stopId: alight.dest.id, name: alightStop.name, lat: alightStop.lat, lng: alightStop.lng },
        to: { name: to.label ?? "Destination", lat: to.lat, lng: to.lng },
        durationSec: walkSecFromMeters(alight.dest.distKm * 1000),
        distanceMeters: walkMetersOnStreet(alight.dest.distKm * 1000),
        verified: false,
      });
      out.push(finalise(legs, departureUnix));
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
  const kept = applyDirectPreference([...bySignature.values()]);
  kept.sort((a, b) => a.score - b.score);
  return kept.slice(0, limit);
}