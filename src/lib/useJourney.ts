// Live journey orchestrator. Reads continuous GPS + live realtime feed
// and derives a richer phase machine on top of the time-based one in
// trip.$id.tsx. Emits one-shot push alerts when phases transition.

import { useEffect, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtime } from "./useRealtime";
import { useGeoWatch, type LiveFix } from "./useGeoWatch";
import { distanceM, projectOnSteps, WALK_M_PER_S, type WalkStep } from "./geo";
import { patchActiveTripLive, type ActiveTrip } from "./trip-store";
import { getDeviceId } from "./pwa";
import { sendTripAlert } from "./push.functions";

export type LivePhase =
  | "idle" // start button shown
  | "walking-to-stop"
  | "at-stop"
  | "hurry-soft"
  | "hurry-urgent"
  | "boarding" // bus at stop, on-board prompt visible
  | "missed-bus"
  | "on-bus"
  | "alight-soon"
  | "walking-to-dest"
  | "arrived";

export type LiveJourney = {
  active: boolean;
  fix: LiveFix | null;
  phase: LivePhase;
  // Walking
  currentStepIndex: number;
  metersToStepEnd: number;
  metersToDestination: number;
  walkingEtaSec: number;
  // Bus timing (from realtime, may equal scheduled)
  secsToBoard: number;
  secsToAlight: number;
  /** GPS-fused secsToAlight: blends rider's own phone GPS + bus feed.
   *  Equal to secsToAlight when no fusion signal is available. */
  fusedSecsToAlight: number;
  /** Fused bus position when on-board (rider GPS + feed). Used to drive the
   *  map marker so the bus glides with the phone instead of the lagging feed. */
  fusedVehicle: { lat: number; lng: number; bearing: number; tripId: string } | null;
  // Diagnostics
  onBoardSuggested: boolean; // GPS suggests user is moving with bus
  missedSuggested: boolean;  // bus departed without user confirmation
};


const ARRIVAL_RADIUS_M = 30;   // "at stop" / "arrived at destination"
const BUS_MATCH_RADIUS_M = 60; // user near a live vehicle
const RIDING_SPEED_MPS = 5;    // ~18 km/h, well above walking
const HURRY_SOFT_GAP_S = 180;  // walking ETA within 3 min of bus ETA
const HURRY_URGENT_GAP_S = 0;  // walking ETA exceeds bus ETA

export function useJourney(opts: {
  active: ActiveTrip | null;
  walkingSteps: WalkStep[] | null;
  walkingPhase: "to-stop" | "to-dest" | null;
}): LiveJourney {
  const { active, walkingSteps, walkingPhase } = opts;
  const live = active?.live;
  const started = !!live?.startedAt;

  const { fix } = useGeoWatch(started);
  const { data: rt } = useRealtime();

  const bus = useMemo(() => {
    if (!active) return null;
    const b = active.option.legs.find((l) => l.kind === "bus");
    return b && b.kind === "bus" ? b : null;
  }, [active]);

  const walkIn = active?.option.legs[0];
  const walkOut = active?.option.legs[active.option.legs.length - 1];

  const result = useMemo<LiveJourney>(() => {
    const baseInactive: LiveJourney = {
      active: false,
      fix,
      phase: "idle",
      currentStepIndex: 0,
      metersToStepEnd: 0,
      metersToDestination: 0,
      walkingEtaSec: 0,
      secsToBoard: 0,
      secsToAlight: 0,
      fusedSecsToAlight: 0,
      fusedVehicle: null,
      onBoardSuggested: false,
      missedSuggested: false,
    };

    if (!active || !bus || !started) return baseInactive;
    if (live?.alightedAt || walkingPhase === null && live?.onBoardConfirmedAt && bus) {
      // continue, handled below
    }

    const now = Math.floor(Date.now() / 1000);
    const liveBoard = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.board.stopId,
    );
    const liveAlight = rt?.arrivals.find(
      (a) => a.tripId === bus.tripId && a.stopId === bus.alight.stopId,
    );
    const boardUnix = liveBoard?.arrivalUnix ?? bus.board.departureUnix;
    const alightUnix = liveAlight?.arrivalUnix ?? bus.alight.arrivalUnix;
    const secsToBoard = boardUnix - now;
    const secsToAlight = alightUnix - now;

    // Walking projection
    const targetLeg =
      walkingPhase === "to-stop"
        ? walkIn
        : walkingPhase === "to-dest"
          ? walkOut
          : null;
    const destination =
      targetLeg && targetLeg.kind === "walk"
        ? { lat: targetLeg.to.lat, lng: targetLeg.to.lng }
        : null;

    let currentStepIndex = 0;
    let metersToStepEnd = 0;
    let metersToDestination = 0;
    let walkingEtaSec = 0;
    if (fix && destination && walkingSteps && walkingSteps.length > 0) {
      const p = projectOnSteps(fix, walkingSteps, destination);
      currentStepIndex = p.currentIndex;
      metersToStepEnd = p.metersToStepEnd;
      metersToDestination = p.metersToDestination;
      walkingEtaSec = p.walkingEtaSec;
    } else if (fix && destination) {
      metersToDestination = distanceM(fix, destination);
      metersToStepEnd = metersToDestination;
      walkingEtaSec = Math.round(metersToDestination / WALK_M_PER_S);
    }

    // Bus position (live)
    const vehicle = rt?.vehicles.find((v) => v.tripId === bus.tripId);
    const distToBus = fix && vehicle ? distanceM(fix, vehicle) : Infinity;

    // ---- Phase resolution ---------------------------------------------------
    let phase: LivePhase = "walking-to-stop";

    // After-the-bus leg
    if (live?.alightedAt) {
      if (fix && metersToDestination < ARRIVAL_RADIUS_M) phase = "arrived";
      else phase = "walking-to-dest";
    } else if (live?.onBoardConfirmedAt) {
      // Riding
      if (secsToAlight <= 60) phase = "alight-soon";
      else phase = "on-bus";
    } else if (live?.missedAt) {
      phase = "missed-bus";
    } else {
      // Pre-board phase
      const atStop =
        fix &&
        bus &&
        distanceM(fix, {
          lat: walkIn?.kind === "walk" ? walkIn.to.lat : 0,
          lng: walkIn?.kind === "walk" ? walkIn.to.lng : 0,
        }) < ARRIVAL_RADIUS_M;

      if (atStop) {
        // Vehicle nearby and at stop → boarding window
        if (vehicle && distToBus < BUS_MATCH_RADIUS_M) phase = "boarding";
        else phase = "at-stop";
      } else {
        phase = "walking-to-stop";
        // Hurry escalation while walking
        if (secsToBoard > 0) {
          const gap = secsToBoard - walkingEtaSec;
          if (gap <= HURRY_URGENT_GAP_S) phase = "hurry-urgent";
          else if (gap <= HURRY_SOFT_GAP_S) phase = "hurry-soft";
        }
      }

      // Missed-bus detection: vehicle has clearly left the board stop and
      // is moving away from it, but we haven't confirmed on-board.
      if (vehicle && bus) {
        const boardLoc = { lat: 0, lng: 0 };
        if (walkIn?.kind === "walk") {
          boardLoc.lat = walkIn.to.lat;
          boardLoc.lng = walkIn.to.lng;
        }
        const busFromStop = distanceM(vehicle, boardLoc);
        if (busFromStop > 200 && now > boardUnix + 30) {
          // and user is NOT near the bus
          if (!fix || distanceM(fix, vehicle) > 200) {
            phase = "missed-bus";
          }
        }
      }
    }

    // On-board auto-detection heuristic (suggest prompt, never auto-skip)
    const onBoardSuggested =
      !!fix &&
      !!vehicle &&
      distToBus < BUS_MATCH_RADIUS_M &&
      (fix.speedMps ?? 0) > RIDING_SPEED_MPS &&
      !live?.onBoardConfirmedAt;

    const missedSuggested = phase === "missed-bus";

    return {
      active: true,
      fix,
      phase,
      currentStepIndex,
      metersToStepEnd,
      metersToDestination,
      walkingEtaSec,
      secsToBoard,
      secsToAlight,
      onBoardSuggested,
      missedSuggested,
    };
  }, [active, bus, fix, live, rt, started, walkIn, walkOut, walkingPhase, walkingSteps]);

  // ---- Push alerting on phase transition -----------------------------------
  const sentRef = useRef<Set<string>>(new Set());
  const sendAlert = useServerFn(sendTripAlert);

  useEffect(() => {
    if (!result.active || !bus) return;
    const deviceId = getDeviceId();
    const fireOnce = (key: string, fn: () => void) => {
      if (sentRef.current.has(key)) return;
      sentRef.current.add(key);
      fn();
    };
    const url = `/trip/${(active!.option.id)}`;

    if (result.phase === "hurry-soft") {
      fireOnce("hurry-soft", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "hurry-soft",
            routeShort: bus.routeShort,
            stopName: bus.board.name,
            minutes: Math.max(0, Math.round(result.secsToBoard / 60)),
            url,
          },
        }).catch(() => {}),
      );
    } else if (result.phase === "hurry-urgent") {
      fireOnce("hurry-urgent", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "hurry-urgent",
            routeShort: bus.routeShort,
            stopName: bus.board.name,
            minutes: Math.max(0, Math.round(result.secsToBoard / 60)),
            url,
          },
        }).catch(() => {}),
      );
    } else if (result.phase === "at-stop") {
      fireOnce("at-stop", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "at-stop",
            routeShort: bus.routeShort,
            stopName: bus.board.name,
            minutes: Math.max(0, Math.round(result.secsToBoard / 60)),
            url,
          },
        }).catch(() => {}),
      );
    } else if (result.phase === "boarding" && result.onBoardSuggested) {
      fireOnce("confirm-onboard", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "confirm-onboard",
            routeShort: bus.routeShort,
            url,
          },
        }).catch(() => {}),
      );
    } else if (result.phase === "missed-bus") {
      fireOnce("missed-bus", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "missed-bus",
            routeShort: bus.routeShort,
            stopName: bus.board.name,
            url,
          },
        }).catch(() => {}),
      );
    } else if (result.phase === "alight-soon") {
      fireOnce("press-stop", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "press-stop",
            routeShort: bus.routeShort,
            stopName: bus.alight.name,
            url,
          },
        }).catch(() => {}),
      );
    } else if (result.phase === "arrived") {
      fireOnce("arrived", () =>
        sendAlert({
          data: {
            deviceId,
            kind: "arrived",
            url,
          },
        }).catch(() => {}),
      );
    }
  }, [result.phase, result.onBoardSuggested, result.secsToBoard, result.active, active, bus, sendAlert]);

  return result;
}

// ---- Action helpers -------------------------------------------------------

export function startLiveTracking() {
  patchActiveTripLive({ startedAt: Date.now() });
}
export function confirmOnBoard() {
  patchActiveTripLive({ onBoardConfirmedAt: Date.now() });
}
export function markMissed() {
  patchActiveTripLive({ missedAt: Date.now() });
}
export function markAlighted() {
  patchActiveTripLive({ alightedAt: Date.now() });
}
