// Turning RAPTOR labels back into a journey a rider can read.
//
// The search leaves behind one label per stop per round; this module walks
// that chain backwards from the destination and rebuilds the actual legs —
// access walk, waits, rides, interchange walks and the final walk to the
// door — so the scheduled planner emits the same shape as the live one.

import type { LoadedSchedule, ScheduleStop } from "./schedule-types";
import { serviceDateToUnix } from "./schedule-types";
import type { Itinerary, Leg } from "./itinerary-types";
import { finalise, walkMetersOnStreet, walkSecFromMeters } from "@aloya/core/raptor-core";
import type { PlanContext } from "@aloya/core/raptor-core";

// ---- Labels: the state we track per stop -------------------------------
// For each stop we keep the best arrival per round k. We need round-k
// labels (not just global best) so round k+1 can extend any frontier stop
// reached at round k.

export type RideLabel = {
  kind: "ride";
  arrivalUnix: number;
  prevStopId: string; // boarding stop on this trip
  prevArrivalUnix: number; // when we arrived at boarding stop in round k-1
  tripId: string;
  routeId: string;
  boardSeq: number;
  alightSeq: number;
};
export type WalkLabel = {
  kind: "walk";
  arrivalUnix: number;
  prevStopId: string;
  prevArrivalUnix: number;
  meters: number;
};
export type AccessLabel = {
  kind: "access";
  arrivalUnix: number;
  meters: number;
};
export type Label = RideLabel | WalkLabel | AccessLabel;

export function reconstruct(
  labels: Array<Map<string, Label>>,
  endRound: number,
  endStopId: string,
  endMeta: { stop: ScheduleStop; id: string; distKm: number },
  schedule: LoadedSchedule,
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  departureUnix: number,
  planContext?: PlanContext,
): Itinerary | null {
  const { stops, routes, stopTimes } = schedule;
  type Chain = { stopId: string; round: number; label: Label };
  const chain: Chain[] = [];
  let curStop = endStopId;
  let curRound = endRound;
  // Walk back round-by-round
  // Walks within a round are stored in the same round; we encode them as
  // walking labels and chain back through prevStopId in same round.
  let safety = 0;
  while (safety++ < 50) {
    const label = labels[curRound]?.get(curStop);
    if (!label) return null;
    chain.push({ stopId: curStop, round: curRound, label });
    if (label.kind === "access") break;
    const prevId = label.prevStopId;
    // ride moves us back to round-1, walk stays in same round.
    if (label.kind === "ride") {
      curStop = prevId;
      curRound = curRound - 1;
    } else if (label.kind === "walk") {
      curStop = prevId;
      // walk doesn't change round
    }
  }
  if (safety >= 50) return null;
  chain.reverse();

  // Build legs.
  const legs: Leg[] = [];

  // Access walk from origin to first stop (chain[0] is access label).
  const accessLabel = chain[0].label as AccessLabel;
  const firstStopId = chain[0].stopId;
  const firstStop = stops[firstStopId];
  legs.push({
    kind: "walk",
    from: { name: from.label ?? "Start", lat: from.lat, lng: from.lng },
    to: { stopId: firstStopId, name: firstStop.name, lat: firstStop.lat, lng: firstStop.lng },
    durationSec: accessLabel.arrivalUnix - departureUnix,
    distanceMeters: accessLabel.meters,
    verified: false,
  });

  // Iterate chain pairwise.
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const node = chain[i];
    const label = node.label;
    if (label.kind === "ride") {
      const boardStop = stops[prev.stopId];
      const alightStop = stops[node.stopId];
      const routeMeta = routes[label.routeId];
      const tripSt = stopTimes[label.tripId];
      if (!tripSt) return null;
      // depUnix at board:
      const boardRow = tripSt.find((r) => r[0] === prev.stopId && r[3] === label.boardSeq);
      if (!boardRow) return null;
      const depUnix = serviceDateToUnix(schedule.date, boardRow[1]);
      // Wait before boarding if any.
      const wait = depUnix - label.prevArrivalUnix;
      if (wait >= 30) {
        legs.push({
          kind: "wait",
          stopId: prev.stopId,
          name: boardStop.name,
          lat: boardStop.lat,
          lng: boardStop.lng,
          durationSec: wait,
        });
      }
      const stopCount = label.alightSeq - label.boardSeq;
      const via = tripSt
        .filter((r) => r[3] > label.boardSeq && r[3] < label.alightSeq)
        .sort((a, b) => a[3] - b[3])
        .flatMap((r) => {
          const s = stops[r[0]];
          return s
            ? [
                {
                  stopId: r[0],
                  name: s.name,
                  lat: s.lat,
                  lng: s.lng,
                  arrivalUnix: serviceDateToUnix(schedule.date, r[2]),
                },
              ]
            : [];
        });
      legs.push({
        kind: "ride",
        routeId: label.routeId,
        routeShort: routeMeta?.short ?? "?",
        routeLong: routeMeta?.long ?? "",
        tripId: label.tripId,
        live: false,
        board: {
          stopId: prev.stopId,
          name: boardStop.name,
          lat: boardStop.lat,
          lng: boardStop.lng,
          departureUnix: depUnix,
        },
        alight: {
          stopId: node.stopId,
          name: alightStop.name,
          lat: alightStop.lat,
          lng: alightStop.lng,
          arrivalUnix: label.arrivalUnix,
        },
        stopCount,
        delaySec: 0,
        via,
      });
    } else if (label.kind === "walk") {
      const a = stops[prev.stopId];
      const b = stops[node.stopId];
      legs.push({
        kind: "walk",
        from: { stopId: prev.stopId, name: a.name, lat: a.lat, lng: a.lng },
        to: { stopId: node.stopId, name: b.name, lat: b.lat, lng: b.lng },
        durationSec: label.arrivalUnix - label.prevArrivalUnix,
        distanceMeters: label.meters,
        verified: false,
      });
    }
  }

  // Egress walk from last alight to destination.
  const lastStopId = endStopId;
  const lastStop = stops[lastStopId];
  const egressMeters = walkMetersOnStreet(endMeta.distKm * 1000);
  const egressSec = walkSecFromMeters(endMeta.distKm * 1000);
  legs.push({
    kind: "walk",
    from: { stopId: lastStopId, name: lastStop.name, lat: lastStop.lat, lng: lastStop.lng },
    to: { name: to.label ?? "Destination", lat: to.lat, lng: to.lng },
    durationSec: egressSec,
    distanceMeters: egressMeters,
    verified: false,
  });

  return finalise(legs, departureUnix, planContext);
}
