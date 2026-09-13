// Copy, option synthesis and small formatters for the native EarlyAlight /
// LiveReplan sheet. Split out of the component so the sheet stays a view.

import type { Itinerary as PlanItinerary } from "@/lib/plan";
import type { ActiveTrip } from "@/lib/trip-store";
import type { RideLeg, WalkLeg, JourneyOption } from "@/lib/journey-types";
import type { DisruptionKind } from "@/lib/useDisruptionWatch";

export const KICKER = {
  fontFamily: "Geist_700Bold" as const,
  fontSize: 10,
  letterSpacing: 2.2,
  textTransform: "uppercase" as const,
};

export const COPY: Record<
  DisruptionKind | "early-alight",
  { eyebrow: string; title: string; sub: string }
> = {
  "early-alight": {
    eyebrow: "Off the plan",
    title: "Find a new way from here",
    sub: "We'll reroute from your current position to your destination.",
  },
  "missed-connection": {
    eyebrow: "Missed connection",
    title: "Let's find a new way",
    sub: "Your connecting bus has left. Here are the next best options.",
  },
  "running-late": {
    eyebrow: "Running late",
    title: "Faster options from here",
    sub: "A different route may still get you there sooner.",
  },
  "connection-at-risk": {
    eyebrow: "Tight connection",
    title: "Backup routes",
    sub: "If you miss the transfer, one of these picks up from here.",
  },
  "vehicle-lost-feed": {
    eyebrow: "Live feed down",
    title: "Alternatives from here",
    sub: "In case the bus doesn't reappear, here are other options.",
  },
  "ghost-pre-board": {
    eyebrow: "No GPS from this bus",
    title: "Backup routes",
    sub: "The bus may still show up — but here are alternatives.",
  },
  "late-pre-board": {
    eyebrow: "Bus is late",
    title: "Faster options",
    sub: "The bus is slipping before you've even boarded.",
  },
};

export function synthesizeOption(it: PlanItinerary, destLabel: string): JourneyOption {
  const firstRide = it.legs.find((l): l is RideLeg => l.kind === "ride");
  const walkIn = it.legs[0];
  const walkOut = it.legs[it.legs.length - 1];
  const legs: JourneyOption["legs"] = [];
  if (walkIn?.kind === "walk") {
    const w = walkIn as WalkLeg;
    legs.push({
      kind: "walk",
      from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
      to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
      durationSec: w.durationSec,
      distanceMeters: w.distanceMeters,
    });
  }
  if (firstRide) {
    legs.push({
      kind: "bus",
      routeId: firstRide.routeId,
      routeShort: firstRide.routeShort,
      routeLong: firstRide.routeLong,
      tripId: firstRide.tripId,
      board: {
        stopId: firstRide.board.stopId,
        name: firstRide.board.name,
        departureUnix: firstRide.board.departureUnix,
      },
      alight: {
        stopId: firstRide.alight.stopId,
        name: firstRide.alight.name,
        arrivalUnix: firstRide.alight.arrivalUnix,
      },
      delaySec: firstRide.delaySec,
    });
  }
  if (walkOut && walkOut !== walkIn && walkOut.kind === "walk") {
    const w = walkOut as WalkLeg;
    legs.push({
      kind: "walk",
      from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
      to: { lat: w.to.lat, lng: w.to.lng, label: destLabel },
      durationSec: w.durationSec,
      distanceMeters: w.distanceMeters,
    });
  }
  return {
    id: it.id,
    totalDurationSec: it.totalDurationSec,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    legs,
    transfers: it.transfers,
  };
}

export function fmtMin(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

export function hereStopId(active: ActiveTrip): string | null {
  const ride = active.itinerary?.legs.find((l): l is RideLeg => l.kind === "ride");
  if (ride) return ride.board.stopId;
  const bus = active.option.legs.find((l) => l.kind === "bus");
  return bus && "board" in bus ? bus.board.stopId : null;
}
