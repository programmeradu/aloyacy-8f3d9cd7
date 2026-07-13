// Multi-leg journey reasoning — the pure half of the N-ride orchestrator.
//
// `src/lib/useMultiLegJourney.ts` (web) and `mobile/lib/useMultiLegJourney.ts`
// (native) each used to carry their own copy of this arithmetic: which leg is
// current, which ride is "current" vs "next", the phase machine, the on-board
// vehicle fusion, the ETA distance floor, missed-connection detection and the
// leg auto-advance rules. None of it touches React, the network or the DOM, so
// it lives here where tests pin it and the two clients cannot drift.

import { distanceM, type LatLng } from "./geo";
import type { Leg, RideLeg } from "./itinerary-types";

export type MultiLegPhase =
  | "idle"
  | "walking-to-board"
  | "waiting-to-board"
  | "riding"
  | "alight-soon"
  | "walking-to-transfer"
  | "waiting-for-connection"
  | "missed-connection"
  | "walking-to-destination"
  | "arrived";

/** Tuning constants, exported so both clients and the tests share one source. */
export const MULTILEG_TUNING = {
  /** Rider counts as "at" a stop within this radius, metres. */
  STOP_ARRIVAL_RADIUS_M: 30,
  /** Rider counts as "arrived" at the destination within this radius. */
  DEST_ARRIVAL_RADIUS_M: 30,
  /** Connection running this late (seconds) vs schedule is flagged late. */
  CONNECTION_LATE_S: 5 * 60,
  /** ~18 km/h — comfortably above any walking pace. */
  RIDING_SPEED_MPS: 5,
  /** How long past a connection's departure before we call it missed. */
  MISSED_CONNECTION_BUFFER_S: 90,
  /** Sustained bus-speed motion required before auto-confirming boarding. */
  SUSTAINED_RIDING_MS: 12_000,
  /** How far past the board stop the rider must travel to read as riding. */
  RIDING_DISPLACEMENT_M: 80,
  /** Optimistic urban+intercity ceiling used as the ETA floor, ~40 km/h. */
  FLOOR_SPEED_MPS: 11,
  /** GPS proximity that alone justifies the alight warning. */
  ALIGHT_CERTAIN_M: 120,
  /** GPS proximity that, combined with a ≤60 s ETA, justifies the warning. */
  ALIGHT_NEAR_M: 350,
  /** Egress walk: how far from the alight stop before "arrived" can fire. */
  EGRESS_WALKED_AWAY_M: 50,
  /** Egress walk: settle window before "arrived" can fire, seconds. */
  EGRESS_SETTLE_S: 20,
} as const;

const T = MULTILEG_TUNING;

/** Per-leg rider confirmations persisted by the trip store. */
export type PerLegState = {
  enteredAt?: number | null;
  onBoardConfirmedAt?: number | null;
  alightedAt?: number | null;
  arrivedAt?: number | null;
  missedAt?: number | null;
};

// ---------------------------------------------------------------------------
// Leg resolution
// ---------------------------------------------------------------------------

export type LegResolution = {
  /** Clamped index into `legs`. */
  index: number;
  currentLeg: Leg | null;
  nextLeg: Leg | null;
  /** The ride the rider is on, or the next ride ahead of a walk/wait. */
  currentRideLeg: RideLeg | null;
  /** The ride after `currentRideLeg` — the transfer target. */
  nextRideLeg: RideLeg | null;
  /**
   * The ride the rider is actually waiting to board next, for connection
   * countdowns and missed-connection detection. On a ride leg that is the
   * ride after this one; on a transfer walk or a wait leg it is the ride
   * they are walking/waiting for (which `currentRideLeg` already points at,
   * so `nextRideLeg` would be one ride too far ahead).
   */
  connectionRideLeg: RideLeg | null;
  /** 1-indexed position of `currentRideLeg` among all rides; 0 when none. */
  rideOrdinal: number;
  totalRides: number;
  /** Ride legs strictly before the current index. */
  ridesBefore: number;
  /** Ride legs strictly after the current index. */
  ridesAfter: number;
};

export function resolveLegs(legs: Leg[], currentLegIndex: number): LegResolution {
  const empty: LegResolution = {
    index: 0,
    currentLeg: null,
    nextLeg: null,
    currentRideLeg: null,
    nextRideLeg: null,
    connectionRideLeg: null,
    rideOrdinal: 0,
    totalRides: 0,
    ridesBefore: 0,
    ridesAfter: 0,
  };
  if (!legs.length) return empty;

  const index = Math.max(0, Math.min(currentLegIndex, legs.length - 1));
  const rides = legs
    .map((l, i) => (l.kind === "ride" ? { leg: l, i } : null))
    .filter((x): x is { leg: RideLeg; i: number } => x !== null);

  const currentEntry = rides.find((r) => r.i === index) ?? rides.find((r) => r.i > index) ?? null;
  const nextEntry = currentEntry ? (rides.find((r) => r.i > currentEntry.i) ?? null) : null;

  const currentLeg = legs[index] ?? null;
  const ridesBefore = rides.filter((r) => r.i < index).length;
  const waitingForConnection = !!currentLeg && currentLeg.kind !== "ride" && ridesBefore > 0;

  return {
    index,
    currentLeg,
    nextLeg: legs[index + 1] ?? null,
    currentRideLeg: currentEntry?.leg ?? null,
    nextRideLeg: nextEntry?.leg ?? null,
    connectionRideLeg: waitingForConnection
      ? (currentEntry?.leg ?? null)
      : (nextEntry?.leg ?? null),
    rideOrdinal: currentEntry ? rides.findIndex((r) => r.i === currentEntry.i) + 1 : 0,
    totalRides: rides.length,
    ridesBefore,
    ridesAfter: rides.filter((r) => r.i > index).length,
  };
}

/** Spatial target of a leg: where the rider is currently heading. */
export function legTarget(leg: Leg | null): LatLng | null {
  if (!leg) return null;
  if (leg.kind === "walk") return { lat: leg.to.lat, lng: leg.to.lng };
  if (leg.kind === "wait") return { lat: leg.lat, lng: leg.lng };
  return { lat: leg.board.lat, lng: leg.board.lng };
}

// ---------------------------------------------------------------------------
// Phase machine
// ---------------------------------------------------------------------------

export type MultiLegPhaseInput = {
  nowUnix: number;
  nowMs: number;
  fix: (LatLng & { speedMps?: number | null }) | null;
  resolution: LegResolution;
  per: PerLegState;
  metersToTarget: number;
  secsToCurrentAlight: number;
  /** Live-or-scheduled unix departure of the NEXT ride, 0 when none. */
  nextBoardUnix: number;
};

export function resolveMultiLegPhase(input: MultiLegPhaseInput): MultiLegPhase {
  const {
    nowUnix,
    nowMs,
    fix,
    resolution,
    per,
    metersToTarget,
    secsToCurrentAlight,
    nextBoardUnix,
  } = input;
  const { currentLeg, currentRideLeg, connectionRideLeg, ridesBefore, ridesAfter } = resolution;
  if (!currentLeg) return "idle";

  let phase: MultiLegPhase = "idle";

  if (currentLeg.kind === "walk") {
    if (ridesAfter === 0) phase = "walking-to-destination";
    else if (ridesBefore === 0) phase = "walking-to-board";
    else phase = "walking-to-transfer";

    const radius =
      phase === "walking-to-destination" ? T.DEST_ARRIVAL_RADIUS_M : T.STOP_ARRIVAL_RADIUS_M;
    const within = !!fix && metersToTarget < radius;

    let arrivedHere = within;
    if (phase === "walking-to-destination") {
      // GPS often still reports the on-board position for several seconds
      // after alighting, and the destination can sit near the alight stop.
      // Require real displacement plus a settle window before "arrived".
      const enteredAt = per.enteredAt ?? 0;
      const secsInLeg = enteredAt ? (nowMs - enteredAt) / 1000 : 0;
      const distFromAlightStop = fix
        ? distanceM(fix, { lat: currentLeg.from.lat, lng: currentLeg.from.lng })
        : 0;
      arrivedHere =
        within && distFromAlightStop > T.EGRESS_WALKED_AWAY_M && secsInLeg > T.EGRESS_SETTLE_S;
    }

    const manualArrived = phase === "walking-to-destination" && !!per.arrivedAt;
    if (manualArrived || arrivedHere) {
      if (phase === "walking-to-destination") phase = "arrived";
      else if (phase === "walking-to-board") phase = "waiting-to-board";
      // walking-to-transfer advances via the leg auto-advance rules.
    }
  } else if (currentLeg.kind === "wait") {
    phase = "waiting-for-connection";
  } else if (per.alightedAt) {
    // Past this ride — transitional until auto-advance moves the index.
    phase = "alight-soon";
  } else if (per.onBoardConfirmedAt) {
    // Gate "alight-soon" on BOTH schedule ETA and physical proximity: the
    // schedule alone fires several stops early on a bus running ahead, and
    // distance alone fires when the path merely passes the alight stop.
    const distToAlight =
      fix && currentRideLeg
        ? distanceM(fix, { lat: currentRideLeg.alight.lat, lng: currentRideLeg.alight.lng })
        : Number.POSITIVE_INFINITY;
    const closeByEta = secsToCurrentAlight > 0 && secsToCurrentAlight <= 60;
    if (distToAlight < T.ALIGHT_NEAR_M && closeByEta) phase = "alight-soon";
    else if (distToAlight < T.ALIGHT_CERTAIN_M) phase = "alight-soon";
    else phase = "riding";
  } else {
    phase = "waiting-to-board";
  }

  if (
    (phase === "waiting-for-connection" || phase === "walking-to-transfer") &&
    connectionRideLeg &&
    nextBoardUnix > 0 &&
    nowUnix - nextBoardUnix > T.MISSED_CONNECTION_BUFFER_S
  ) {
    phase = "missed-connection";
  }

  return phase;
}

// ---------------------------------------------------------------------------
// Vehicle fusion + ETA floor
// ---------------------------------------------------------------------------

export type FusedRideVehicle = {
  lat: number;
  lng: number;
  bearing: number;
  tripId: string;
};

export function fuseRideVehicle(input: {
  currentRideLeg: RideLeg | null;
  vehicle: (LatLng & { bearing?: number | null }) | null;
  fix: (LatLng & { headingDeg?: number | null }) | null;
  onBoard: boolean;
}): { fusedCurrentVehicle: FusedRideVehicle | null; vehicleLost: boolean } {
  const { currentRideLeg, vehicle, fix, onBoard } = input;
  if (!currentRideLeg) return { fusedCurrentVehicle: null, vehicleLost: false };
  if (vehicle) {
    return {
      fusedCurrentVehicle: {
        lat: vehicle.lat,
        lng: vehicle.lng,
        bearing: vehicle.bearing ?? 0,
        tripId: currentRideLeg.tripId,
      },
      vehicleLost: false,
    };
  }
  if (onBoard && fix) {
    // Feed lost the trip — the rider IS the bus.
    return {
      fusedCurrentVehicle: {
        lat: fix.lat,
        lng: fix.lng,
        bearing: fix.headingDeg ?? 0,
        tripId: currentRideLeg.tripId,
      },
      vehicleLost: true,
    };
  }
  return { fusedCurrentVehicle: null, vehicleLost: false };
}

/**
 * Clamps the schedule countdown by what is physically possible from the
 * vehicle's current position, blending in GPS speed and (web) the
 * traffic-aware Google Routes drive ETA when present.
 */
export function fuseAlightEta(input: {
  onBoard: boolean;
  fusedVehicle: LatLng | null;
  alightLoc: LatLng | null;
  secsToAlight: number;
  gpsSpeedMps?: number | null;
  vehicleLost: boolean;
  driveEtaSec?: number | null;
}): number {
  const {
    onBoard,
    fusedVehicle,
    alightLoc,
    secsToAlight,
    gpsSpeedMps = 0,
    vehicleLost,
    driveEtaSec = null,
  } = input;
  if (!onBoard || !fusedVehicle || !alightLoc) return secsToAlight;

  const distToAlight = distanceM(fusedVehicle, alightLoc);
  const floor = Math.round(distToAlight / T.FLOOR_SPEED_MPS);
  const speed = gpsSpeedMps ?? 0;

  let eta: number;
  if (driveEtaSec != null) {
    eta = Math.max(floor, driveEtaSec);
  } else if (vehicleLost) {
    eta = Math.max(floor, Math.round(distToAlight / (speed > 2 ? speed : 6)));
  } else if (speed > 2) {
    const gpsEta = Math.round(distToAlight / Math.max(3, speed));
    eta = Math.max(floor, Math.round(0.6 * gpsEta + 0.4 * secsToAlight));
  } else {
    // Bus stopped — freeze the ETA at the distance floor.
    eta = Math.max(floor, secsToAlight);
  }
  return Math.max(0, eta);
}

// ---------------------------------------------------------------------------
// Auto-advance + auto-confirm
// ---------------------------------------------------------------------------

export function shouldAdvanceLeg(input: {
  leg: Leg | null;
  isFinalLeg: boolean;
  hasFix: boolean;
  metersToTarget: number;
  enteredAt?: number | null;
  per: PerLegState;
  nowMs: number;
}): boolean {
  const { leg, isFinalLeg, hasFix, metersToTarget, enteredAt, per, nowMs } = input;
  if (!leg) return false;
  const elapsed = enteredAt ? (nowMs - enteredAt) / 1000 : null;

  if (leg.kind === "walk") {
    if (isFinalLeg) return false; // egress ends at "arrived", not a new leg
    if (hasFix && metersToTarget < T.STOP_ARRIVAL_RADIUS_M) return true;
    // Failsafe so a missing or poor GPS never strands the rider mid-walk.
    return elapsed != null && elapsed > leg.durationSec + 120;
  }
  if (leg.kind === "wait") {
    // Move on 30 s early so the ride UI is up before the bus rolls in.
    return elapsed != null && elapsed > Math.max(0, leg.durationSec - 30);
  }
  return !!per.alightedAt;
}

export function shouldAutoConfirmRide(input: {
  leg: Leg | null;
  per: PerLegState;
  fix: (LatLng & { speedMps?: number | null }) | null;
  boardLoc: LatLng | null;
  ridingSinceMs: number | null;
  nowMs: number;
}): { confirm: boolean; ridingSinceMs: number | null } {
  const { leg, per, fix, boardLoc, ridingSinceMs, nowMs } = input;
  const reset = { confirm: false, ridingSinceMs: null } as const;
  if (!leg || leg.kind !== "ride") return reset;
  if (per.onBoardConfirmedAt || per.alightedAt || per.missedAt) return reset;
  if ((fix?.speedMps ?? 0) <= T.RIDING_SPEED_MPS) return reset;
  if (!fix || !boardLoc || distanceM(fix, boardLoc) <= T.RIDING_DISPLACEMENT_M) return reset;
  if (ridingSinceMs == null) return { confirm: false, ridingSinceMs: nowMs };
  if (nowMs - ridingSinceMs >= T.SUSTAINED_RIDING_MS) return { confirm: true, ridingSinceMs: null };
  return { confirm: false, ridingSinceMs };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type MultiLegAlert = {
  /** Idempotency key — fire each at most once per journey. */
  key: string;
  kind: "press-stop" | "at-stop" | "hurry-soft" | "missed-bus" | "arrived";
  routeShort?: string;
  stopName?: string;
  minutes?: number;
};

export function multiLegAlerts(input: {
  phase: MultiLegPhase;
  legIndex: number;
  currentRideLeg: RideLeg | null;
  nextRideLeg: RideLeg | null;
  secsToNextBoard: number;
  nextBoardLate: boolean;
}): MultiLegAlert[] {
  const { phase, legIndex, currentRideLeg, nextRideLeg, secsToNextBoard, nextBoardLate } = input;
  const out: MultiLegAlert[] = [];

  if (phase === "alight-soon" && currentRideLeg) {
    out.push({
      key: `press-stop:${legIndex}`,
      kind: "press-stop",
      routeShort: currentRideLeg.routeShort,
      stopName: currentRideLeg.alight.name,
    });
  }
  if (phase === "walking-to-transfer" && nextRideLeg) {
    out.push({
      key: `walk-transfer:${legIndex}`,
      kind: "at-stop",
      routeShort: nextRideLeg.routeShort,
      stopName: nextRideLeg.board.name,
      minutes: Math.max(0, Math.round(secsToNextBoard / 60)),
    });
  }
  if (
    phase === "waiting-for-connection" &&
    nextRideLeg &&
    secsToNextBoard > 0 &&
    secsToNextBoard <= 90
  ) {
    out.push({
      key: `connection-arriving:${legIndex}`,
      kind: "at-stop",
      routeShort: nextRideLeg.routeShort,
      stopName: nextRideLeg.board.name,
      minutes: Math.max(1, Math.round(secsToNextBoard / 60)),
    });
  }
  if (nextBoardLate && nextRideLeg) {
    out.push({
      key: `connection-late:${legIndex}`,
      kind: "hurry-soft",
      routeShort: nextRideLeg.routeShort,
      stopName: nextRideLeg.board.name,
      minutes: Math.max(0, Math.round(secsToNextBoard / 60)),
    });
  }
  if (phase === "missed-connection" && nextRideLeg) {
    out.push({
      key: `missed-connection:${legIndex}`,
      kind: "missed-bus",
      routeShort: nextRideLeg.routeShort,
      stopName: nextRideLeg.board.name,
    });
  }
  if (phase === "arrived") out.push({ key: "arrived", kind: "arrived" });

  return out;
}

/** True when the connecting ride is running meaningfully late vs schedule. */
export function isConnectionLate(
  liveNextBoardUnix: number | null | undefined,
  scheduledNextBoardUnix: number | null | undefined,
): boolean {
  if (liveNextBoardUnix == null || scheduledNextBoardUnix == null) return false;
  return liveNextBoardUnix - scheduledNextBoardUnix >= T.CONNECTION_LATE_S;
}
