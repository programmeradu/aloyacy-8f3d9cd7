// Live journey reasoning — the pure half of the GPS × feed orchestrator.
//
// `src/lib/useJourney.ts` (web) and `mobile/lib/useJourney.ts` (native) used
// to each carry their own copy of this arithmetic: phase resolution, the
// vehicle-position ETA floor, and the GPS/feed fusion that drives the map
// marker and the time-to-alight. None of it touches React, the network or
// the DOM, so it lives here where it is pinned by tests and can never drift
// between the two clients.

import { distanceM, type LatLng } from "./geo";

/** Phase names emitted by the live (GPS-truth) journey tracker. */
export type LivePhase =
  | "idle"
  | "walking-to-stop"
  | "at-stop"
  | "hurry-soft"
  | "hurry-urgent"
  | "boarding"
  | "missed-bus"
  | "on-bus"
  | "alight-soon"
  | "walking-to-dest"
  | "arrived";

/** Tuning constants, exported so both clients and the tests share one source. */
export const JOURNEY_TUNING = {
  /** "At stop" / "arrived at destination" radius, metres. */
  ARRIVAL_RADIUS_M: 30,
  /** Rider counts as standing next to a live vehicle within this radius. */
  BUS_MATCH_RADIUS_M: 60,
  /** ~18 km/h — comfortably above any walking pace. */
  RIDING_SPEED_MPS: 5,
  /** Walking ETA within 3 min of the bus ETA → soft hurry. */
  HURRY_SOFT_GAP_S: 180,
  /** Walking ETA exceeds the bus ETA → urgent hurry. */
  HURRY_URGENT_GAP_S: 0,
  /** How far past the board stop the rider must travel before their motion
   *  reads as "on a bus", not "jogging at the curb". */
  RIDING_DISPLACEMENT_M: 80,
  /** Sustained bus-speed motion required before auto-confirming boarding. */
  SUSTAINED_RIDING_MS: 12_000,
  /** Rough urban dwell-inclusive time between consecutive stops. */
  AVG_INTER_STOP_S: 75,
  /** ~25 km/h average urban running speed including stops. */
  AVG_BUS_MPS: 7,
  /** Optimistic urban+intercity ceiling used as the ETA floor, ~40 km/h. */
  FLOOR_SPEED_MPS: 11,
} as const;

const T = JOURNEY_TUNING;

// ---------------------------------------------------------------------------
// Vehicle-position ETA floor
// ---------------------------------------------------------------------------

export type VehicleEtaInput = {
  /** Last known live position of the vehicle. */
  vehicle: LatLng;
  routeId: string;
  boardStopId: string;
  /** Ordered stop-id sequences keyed `"<routeId>|<direction>"`. */
  sequences: Record<string, string[]>;
  /** Stop lookup; returning null/undefined simply skips that stop. */
  getStop: (stopId: string) => LatLng | null | undefined;
};

/**
 * Estimates seconds until the vehicle reaches the board stop from where it
 * physically is, independent of the feed's own `stop_time_update`.
 *
 * The GTFS-RT prediction for the board stop is frequently optimistic when
 * delay propagation lags ("2 min" while the bus is six stops upstream), so
 * the caller uses this as a floor. Returns null when the route sequence
 * doesn't place the vehicle upstream of the board stop.
 */
export function vehicleBasedSecsToBoard(input: VehicleEtaInput): number | null {
  const { vehicle, routeId, boardStopId, sequences, getStop } = input;
  const prefix = routeId + "|";
  let best: { stopsLeft: number; metersToNearest: number } | null = null;

  for (const key of Object.keys(sequences)) {
    if (!key.startsWith(prefix)) continue;
    const seq = sequences[key];
    const boardIdx = seq.indexOf(boardStopId);
    // A board stop at index 0 has nothing upstream of it to measure from.
    if (boardIdx <= 0) continue;

    let nearestIdx = -1;
    let nearestD = Infinity;
    for (let i = 0; i <= boardIdx; i++) {
      const s = getStop(seq[i]);
      if (!s) continue;
      const d = distanceM(vehicle, s);
      if (d < nearestD) {
        nearestD = d;
        nearestIdx = i;
      }
    }
    if (nearestIdx < 0) continue;

    const stopsLeft = boardIdx - nearestIdx;
    if (!best || stopsLeft < best.stopsLeft) {
      best = { stopsLeft, metersToNearest: nearestD };
    }
  }

  if (!best) return null;
  return Math.round(best.metersToNearest / T.AVG_BUS_MPS + best.stopsLeft * T.AVG_INTER_STOP_S);
}

// ---------------------------------------------------------------------------
// Phase resolution
// ---------------------------------------------------------------------------

export type PhaseInput = {
  nowUnix: number;
  /** Rider's fused position; null before the first fix lands. */
  fix: (LatLng & { speedMps?: number | null }) | null;
  /** Live vehicle for this trip, when the feed carries one. */
  vehicle: LatLng | null;
  /** Boarding stop location (from the access walk's end point). */
  boardLoc: LatLng | null;
  /** Destination location (from the egress walk's end point). */
  destLoc: LatLng | null;
  /** Seconds until the bus departs the board stop; may be negative. */
  secsToBoard: number;
  /** Seconds until the bus reaches the alight stop; may be negative. */
  secsToAlight: number;
  /** Rider's on-foot ETA to the board stop. */
  walkingEtaSec: number;
  /** Scheduled or live board time, unix seconds — used for missed detection. */
  boardUnix: number;
  /** Rider confirmations, epoch millis or null. */
  onBoardConfirmedAt?: number | null;
  missedAt?: number | null;
  alightedAt?: number | null;
};

export type PhaseResult = {
  phase: LivePhase;
  /** GPS suggests the rider is moving with a bus but hasn't confirmed. */
  onBoardSuggested: boolean;
  missedSuggested: boolean;
};

/**
 * Derives the live phase from GPS plus feed. Rider confirmations are ordered
 * most-recent-first (alighted beats on-board beats missed) so a confirmation
 * is never walked back by a noisy sensor reading.
 */
export function resolveLivePhase(input: PhaseInput): PhaseResult {
  const {
    nowUnix,
    fix,
    vehicle,
    boardLoc,
    destLoc,
    secsToBoard,
    secsToAlight,
    walkingEtaSec,
    boardUnix,
    onBoardConfirmedAt = null,
    missedAt = null,
    alightedAt = null,
  } = input;

  const gpsSpeed = fix?.speedMps ?? 0;
  const onBoardSuggested = !!fix && gpsSpeed > T.RIDING_SPEED_MPS && !onBoardConfirmedAt;

  let phase: LivePhase;

  if (alightedAt) {
    const distToDest = fix && destLoc ? distanceM(fix, destLoc) : Infinity;
    phase = distToDest < T.ARRIVAL_RADIUS_M ? "arrived" : "walking-to-dest";
  } else if (onBoardConfirmedAt) {
    phase = secsToAlight <= 60 ? "alight-soon" : "on-bus";
  } else if (missedAt) {
    phase = "missed-bus";
  } else {
    const distToBoardStop = fix && boardLoc ? distanceM(fix, boardLoc) : Infinity;
    const atStop = distToBoardStop < T.ARRIVAL_RADIUS_M;
    const distToBus = fix && vehicle ? distanceM(fix, vehicle) : Infinity;

    const ridingByGps = gpsSpeed > T.RIDING_SPEED_MPS;
    const departedStop = distToBoardStop > T.RIDING_DISPLACEMENT_M;
    // Boarding window: from 2 min before the scheduled departure until 3 min
    // after, which covers feed lag plus dwell at the kerb.
    const inBoardingWindow = secsToBoard <= 120 && secsToBoard >= -180;

    if (atStop) {
      // Ask "are you on board?" as soon as ANY signal supports it — better to
      // ask a beat early than to never ask at all.
      const vehicleAtStop = !!vehicle && distToBus < T.BUS_MATCH_RADIUS_M;
      phase = vehicleAtStop || ridingByGps || inBoardingWindow ? "boarding" : "at-stop";
    } else if (ridingByGps && departedStop && inBoardingWindow) {
      // Already away from the stop at bus speed: they boarded moments ago and
      // we simply never got to ask.
      phase = "boarding";
    } else {
      phase = "walking-to-stop";
      if (secsToBoard > 0) {
        const gap = secsToBoard - walkingEtaSec;
        if (gap <= T.HURRY_URGENT_GAP_S) phase = "hurry-urgent";
        else if (gap <= T.HURRY_SOFT_GAP_S) phase = "hurry-soft";
      }
    }

    // Missed-bus detection only fires when we are confident: the vehicle has
    // cleared the stop, the rider isn't moving at bus speed, they're nowhere
    // near the vehicle, and they are still standing at the stop.
    if (vehicle && boardLoc && !ridingByGps) {
      const busFromStop = distanceM(vehicle, boardLoc);
      const riderFarFromBus = !fix || distanceM(fix, vehicle) > 250;
      const riderStillNearStop = !!fix && distToBoardStop < 60;
      if (
        busFromStop > 250 &&
        nowUnix > boardUnix + 60 &&
        riderFarFromBus &&
        riderStillNearStop
      ) {
        phase = "missed-bus";
      }
    }
  }

  return { phase, onBoardSuggested, missedSuggested: phase === "missed-bus" };
}

/** True when sustained bus-speed motion away from the stop should auto-confirm boarding. */
export function shouldAutoConfirmBoarding(input: {
  fix: (LatLng & { speedMps?: number | null }) | null;
  boardLoc: LatLng | null;
  /** When the sustained-motion timer started, epoch millis; null if not running. */
  ridingSinceMs: number | null;
  nowMs: number;
}): { confirm: boolean; ridingSinceMs: number | null } {
  const { fix, boardLoc, ridingSinceMs, nowMs } = input;
  const gpsSpeed = fix?.speedMps ?? 0;
  if (gpsSpeed <= T.RIDING_SPEED_MPS) return { confirm: false, ridingSinceMs: null };
  const departed = !!fix && !!boardLoc && distanceM(fix, boardLoc) > T.RIDING_DISPLACEMENT_M;
  if (!departed) return { confirm: false, ridingSinceMs: null };
  if (ridingSinceMs == null) return { confirm: false, ridingSinceMs: nowMs };
  if (nowMs - ridingSinceMs >= T.SUSTAINED_RIDING_MS) {
    return { confirm: true, ridingSinceMs: null };
  }
  return { confirm: false, ridingSinceMs };
}

// ---------------------------------------------------------------------------
// GPS × feed fusion
// ---------------------------------------------------------------------------

export type FusedVehicle = {
  lat: number;
  lng: number;
  bearing: number;
  tripId: string;
};

export type FusionInput = {
  tripId: string;
  fix: (LatLng & { speedMps?: number | null; headingDeg?: number | null }) | null;
  vehicle: (LatLng & { bearing?: number | null }) | null;
  /** Alight stop location; fusion of the ETA is skipped without it. */
  alightLoc: LatLng | null;
  /** Schedule/feed-derived seconds to the alight stop. */
  secsToAlight: number;
  /** Traffic-aware drive ETA from the Routes API, when available. */
  driveEtaSec?: number | null;
};

export type FusionResult = {
  fusedVehicle: FusedVehicle | null;
  /** The feed lost this vehicle and the rider's phone is standing in for it. */
  vehicleLost: boolean;
  fusedSecsToAlight: number;
};

/**
 * Blends the rider's phone with the vehicle feed once boarding is confirmed.
 *
 * Marker position: a light 35/65 blend when both signals agree the rider is
 * riding (smooths feed lag without overpowering it), the raw feed when they
 * don't, and the phone alone when the feed drops the vehicle entirely.
 *
 * ETA, in priority order: the traffic-aware drive ETA, then GPS speed over
 * the remaining distance, then a distance floor over the schedule — never
 * below what is physically possible at `FLOOR_SPEED_MPS`.
 */
export function fuseVehicleAndEta(input: FusionInput): FusionResult {
  const { tripId, fix, vehicle, alightLoc, secsToAlight, driveEtaSec = null } = input;

  const gpsSpeed = fix?.speedMps ?? 0;
  const distToVehicle = fix && vehicle ? distanceM(fix, vehicle) : Infinity;
  const ridingWithBus = !!fix && !!vehicle && gpsSpeed > T.RIDING_SPEED_MPS && distToVehicle < 250;

  let fusedVehicle: FusedVehicle | null = null;
  let vehicleLost = false;

  if (vehicle && ridingWithBus && fix) {
    fusedVehicle = {
      lat: fix.lat * 0.35 + vehicle.lat * 0.65,
      lng: fix.lng * 0.35 + vehicle.lng * 0.65,
      bearing:
        vehicle.bearing != null
          ? vehicle.bearing
          : gpsSpeed > 2 && fix.headingDeg != null
            ? fix.headingDeg
            : 0,
      tripId,
    };
  } else if (vehicle) {
    fusedVehicle = {
      lat: vehicle.lat,
      lng: vehicle.lng,
      bearing: vehicle.bearing ?? 0,
      tripId,
    };
  } else if (fix) {
    vehicleLost = true;
    fusedVehicle = { lat: fix.lat, lng: fix.lng, bearing: fix.headingDeg ?? 0, tripId };
  }

  let fusedSecsToAlight = secsToAlight;
  if (alightLoc && fusedVehicle) {
    const distToAlight = distanceM(fusedVehicle, alightLoc);
    const minPossibleEta = Math.round(distToAlight / T.FLOOR_SPEED_MPS);

    if (driveEtaSec != null) {
      fusedSecsToAlight = Math.max(minPossibleEta, driveEtaSec);
    } else if (ridingWithBus && gpsSpeed > 2) {
      const gpsEta = Math.round(distToAlight / Math.max(3, gpsSpeed));
      fusedSecsToAlight = Math.max(minPossibleEta, Math.round(0.6 * gpsEta + 0.4 * secsToAlight));
    } else if (vehicleLost) {
      const speed = gpsSpeed > 2 ? gpsSpeed : 6;
      fusedSecsToAlight = Math.max(minPossibleEta, Math.round(distToAlight / speed));
    } else {
      fusedSecsToAlight = Math.max(minPossibleEta, secsToAlight);
    }
    fusedSecsToAlight = Math.max(0, fusedSecsToAlight);
  }

  return { fusedVehicle, vehicleLost, fusedSecsToAlight };
}

// ---------------------------------------------------------------------------
// One-shot alerting
// ---------------------------------------------------------------------------

export type TripAlertKind =
  | "hurry-soft"
  | "hurry-urgent"
  | "at-stop"
  | "confirm-onboard"
  | "missed-bus"
  | "press-stop"
  | "arrived";

export type PhaseAlert = {
  /** De-duplication key: each alert fires at most once per journey. */
  key: string;
  kind: TripAlertKind;
  stopName?: string;
  minutes?: number;
  /** True once the rider is at the door — the caller also records history. */
  recordsHistory: boolean;
};

export type AlertInput = {
  phase: LivePhase;
  onBoardSuggested: boolean;
  secsToBoard: number;
  boardName: string;
  alightName: string;
};

/** The alert a phase deserves, or null when the phase is silent. */
export function alertForPhase(input: AlertInput): PhaseAlert | null {
  const { phase, onBoardSuggested, secsToBoard, boardName, alightName } = input;
  const minutes = Math.max(0, Math.round(secsToBoard / 60));

  switch (phase) {
    case "hurry-soft":
      return { key: "hurry-soft", kind: "hurry-soft", stopName: boardName, minutes, recordsHistory: false };
    case "hurry-urgent":
      return { key: "hurry-urgent", kind: "hurry-urgent", stopName: boardName, minutes, recordsHistory: false };
    case "at-stop":
      return { key: "at-stop", kind: "at-stop", stopName: boardName, minutes, recordsHistory: false };
    case "boarding":
      // Only worth a buzz when GPS actually suggests they've boarded.
      return onBoardSuggested
        ? { key: "confirm-onboard", kind: "confirm-onboard", recordsHistory: false }
        : null;
    case "missed-bus":
      return { key: "missed-bus", kind: "missed-bus", stopName: boardName, recordsHistory: false };
    case "alight-soon":
      return { key: "press-stop", kind: "press-stop", stopName: alightName, recordsHistory: false };
    case "arrived":
      return { key: "arrived", kind: "arrived", recordsHistory: true };
    default:
      return null;
  }
}
