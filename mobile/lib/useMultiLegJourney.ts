// Native multi-leg journey orchestrator. Mirror of web
// `src/lib/useMultiLegJourney.ts` adapted to RN, in the same shape as the
// mobile single-leg `useJourney`:
//
//   - GPS from `useFusedFix` (expo-location + GeoFuser)
//   - realtime from mobile `useRealtime`
//   - persistence via `mobile/lib/trip-store`
//   - alerts LOCAL via `sendLocalTripAlert`
//
// Intentionally deferred to keep parity with the mobile single-leg hook
// (no server hop needed for the flight-in-progress UX):
//   - Google Routes drive-ETA fusion
//   - wrong-stop reroute hint
//   - disruption watcher / live re-plan
//   - training-signal / commute-learner emission
//
// The phase machine, transitions, boarding auto-confirm, missed-connection
// detection, and dual-vehicle map fusion behave identically to web so copy
// and escalation timing feel the same across platforms.

import { useEffect, useMemo, useRef, useState } from "react";
import { distanceM } from "@aloya/core/geo";
import type { JourneyPhase } from "@aloya/core/journey-phase";
import { useFusedFix, type FusedFix } from "./useFusedFix";
import { useRealtime } from "./hooks";
import {
  advanceToNextLeg,
  patchCurrentLeg,
  type ActiveTrip,
} from "./trip-store";
import type { Leg, RideLeg } from "./journey-types";
import { sendLocalTripAlert } from "./tripAlerts";

export type MultiLegPhase = Extract<
  JourneyPhase,
  | "idle"
  | "walking-to-board"
  | "waiting-to-board"
  | "riding"
  | "alight-soon"
  | "walking-to-transfer"
  | "waiting-for-connection"
  | "missed-connection"
  | "walking-to-destination"
  | "arrived"
>;

export type MultiLegLiveFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: number;
};

export type MultiLegLive = {
  active: boolean;
  fix: MultiLegLiveFix | null;
  phase: MultiLegPhase;
  currentLegIndex: number;
  currentLeg: Leg | null;
  nextLeg: Leg | null;
  currentRideLeg: RideLeg | null;
  nextRideLeg: RideLeg | null;
  rideOrdinal: number;
  totalRides: number;
  secsToCurrentBoard: number;
  secsToCurrentAlight: number;
  secsToNextBoard: number;
  nextBoardSource: "live" | "scheduled";
  nextBoardLate: boolean;
  metersToTarget: number;
  fusedCurrentVehicle:
    | { lat: number; lng: number; bearing: number; tripId: string }
    | null;
  vehicleLost: boolean;
  feedStale: boolean;
  tripGhost: boolean;
  nextVehicleTracked: boolean;
};

const STOP_ARRIVAL_RADIUS_M = 30;
const DEST_ARRIVAL_RADIUS_M = 30;
const CONNECTION_LATE_S = 5 * 60;
const RIDING_SPEED_MPS = 5;
const MISSED_CONNECTION_BUFFER_S = 90;
const SUSTAINED_RIDING_MS = 12_000;
const RIDING_DISPLACEMENT_M = 80;

function useTick(ms: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(h);
  }, [ms]);
  return t;
}

function fusedToLive(f: FusedFix): MultiLegLiveFix {
  return {
    lat: f.lat,
    lng: f.lng,
    accuracyM: f.uncertaintyM,
    speedMps: f.speedMps,
    headingDeg: f.bearingDeg,
    timestamp: f.timestamp,
  };
}

export function useMultiLegJourney(active: ActiveTrip | null): MultiLegLive {
  const itin = active?.itinerary ?? null;
  const legState = active?.legState ?? null;
  const started = !!active?.live?.startedAt;

  const { fix: fused } = useFusedFix({ enabled: started });
  const fix = useMemo(() => (fused ? fusedToLive(fused) : null), [fused]);

  const rtQuery = useRealtime();
  const rt = rtQuery.data;
  const feedStale = !!rtQuery.isStale;

  useTick(5_000);

  const result = useMemo<MultiLegLive>(() => {
    const inactive: MultiLegLive = {
      active: false,
      fix,
      phase: "idle",
      currentLegIndex: 0,
      currentLeg: null,
      nextLeg: null,
      currentRideLeg: null,
      nextRideLeg: null,
      rideOrdinal: 0,
      totalRides: 0,
      secsToCurrentBoard: 0,
      secsToCurrentAlight: 0,
      secsToNextBoard: 0,
      nextBoardSource: "scheduled",
      nextBoardLate: false,
      metersToTarget: 0,
      fusedCurrentVehicle: null,
      vehicleLost: false,
      feedStale,
      tripGhost: false,
      nextVehicleTracked: false,
    };

    if (!itin || !legState || !started) return inactive;

    const now = Math.floor(Date.now() / 1000);
    const idx = Math.min(legState.currentLegIndex, itin.legs.length - 1);
    const currentLeg = itin.legs[idx];
    const nextLeg = itin.legs[idx + 1] ?? null;
    const per = legState.perLeg[idx] ?? {};

    const ridesAll = itin.legs
      .map((l, i) => (l.kind === "ride" ? { leg: l, i } : null))
      .filter((x): x is { leg: RideLeg; i: number } => x !== null);
    const totalRides = ridesAll.length;
    const currentRideEntry =
      ridesAll.find((r) => r.i === idx) ??
      ridesAll.find((r) => r.i > idx) ??
      null;
    const currentRideLeg = currentRideEntry?.leg ?? null;
    const currentRideOrdinal = currentRideEntry
      ? ridesAll.findIndex((r) => r.i === currentRideEntry.i) + 1
      : 0;
    const nextRideEntry = currentRideEntry
      ? ridesAll.find((r) => r.i > currentRideEntry.i) ?? null
      : null;
    const nextRideLeg = nextRideEntry?.leg ?? null;

    const liveFor = (ride: RideLeg | null, stopId: string | undefined) =>
      ride && stopId
        ? rt?.arrivals.find(
            (a) => a.tripId === ride.tripId && a.stopId === stopId,
          )
        : undefined;

    const liveCurBoard = liveFor(currentRideLeg, currentRideLeg?.board.stopId);
    const liveCurAlight = liveFor(currentRideLeg, currentRideLeg?.alight.stopId);
    const liveNextBoard = liveFor(nextRideLeg, nextRideLeg?.board.stopId);

    const curBoardUnix =
      liveCurBoard?.arrivalUnix ?? currentRideLeg?.board.departureUnix ?? 0;
    const curAlightUnix =
      liveCurAlight?.arrivalUnix ?? currentRideLeg?.alight.arrivalUnix ?? 0;
    const nextBoardUnix =
      liveNextBoard?.arrivalUnix ?? nextRideLeg?.board.departureUnix ?? 0;

    const secsToCurrentBoard = curBoardUnix ? curBoardUnix - now : 0;
    const secsToCurrentAlight = curAlightUnix ? curAlightUnix - now : 0;
    const secsToNextBoard = nextBoardUnix ? nextBoardUnix - now : 0;
    const nextBoardSource: "live" | "scheduled" = liveNextBoard
      ? "live"
      : "scheduled";
    const nextBoardLate =
      !!liveNextBoard &&
      nextRideLeg !== null &&
      liveNextBoard.arrivalUnix - nextRideLeg.board.departureUnix >=
        CONNECTION_LATE_S;

    let metersToTarget = 0;
    if (fix && currentLeg) {
      const target =
        currentLeg.kind === "walk"
          ? currentLeg.to
          : currentLeg.kind === "wait"
            ? { lat: currentLeg.lat, lng: currentLeg.lng }
            : { lat: currentLeg.board.lat, lng: currentLeg.board.lng };
      metersToTarget = distanceM(fix, target);
    }

    let phase: MultiLegPhase = "idle";
    if (currentLeg) {
      if (currentLeg.kind === "walk") {
        const ridesBeforeThis = ridesAll.filter((r) => r.i < idx).length;
        const ridesAfterThis = ridesAll.filter((r) => r.i > idx).length;
        if (ridesAfterThis === 0) phase = "walking-to-destination";
        else if (ridesBeforeThis === 0) phase = "walking-to-board";
        else phase = "walking-to-transfer";

        const manualArrived =
          phase === "walking-to-destination" && !!per.arrivedAt;
        const radius =
          phase === "walking-to-destination"
            ? DEST_ARRIVAL_RADIUS_M
            : STOP_ARRIVAL_RADIUS_M;
        const within = !!fix && metersToTarget < radius;
        let arrivedHere = within;
        if (phase === "walking-to-destination") {
          const enteredAt = per.enteredAt ?? 0;
          const secsInLeg = enteredAt ? (Date.now() - enteredAt) / 1000 : 0;
          const distFromAlightStop = fix
            ? distanceM(fix, {
                lat: currentLeg.from.lat,
                lng: currentLeg.from.lng,
              })
            : 0;
          arrivedHere = within && distFromAlightStop > 50 && secsInLeg > 20;
        }
        if (manualArrived || arrivedHere) {
          if (phase === "walking-to-destination") phase = "arrived";
          else if (phase === "walking-to-board") phase = "waiting-to-board";
        }
      } else if (currentLeg.kind === "wait") {
        phase = "waiting-for-connection";
      } else {
        if (per.alightedAt) {
          phase = "alight-soon";
        } else if (per.onBoardConfirmedAt) {
          const distToAlight =
            fix && currentRideLeg
              ? distanceM(fix, {
                  lat: currentRideLeg.alight.lat,
                  lng: currentRideLeg.alight.lng,
                })
              : Number.POSITIVE_INFINITY;
          const closeByDistance = distToAlight < 350;
          const closeByEta =
            secsToCurrentAlight > 0 && secsToCurrentAlight <= 60;
          if (closeByDistance && closeByEta) phase = "alight-soon";
          else if (distToAlight < 120) phase = "alight-soon";
          else phase = "riding";
        } else {
          phase = "waiting-to-board";
        }
      }
    }

    // Current vehicle fusion (feed → rider GPS fallback when on board).
    const currentVehicle = currentRideLeg
      ? rt?.vehicles.find((v) => v.tripId === currentRideLeg.tripId) ?? null
      : null;
    const onBoardCurrent =
      !!per.onBoardConfirmedAt &&
      !per.alightedAt &&
      currentLeg?.kind === "ride";
    let fusedCurrentVehicle: MultiLegLive["fusedCurrentVehicle"] = null;
    let vehicleLost = false;
    if (currentRideLeg) {
      if (currentVehicle) {
        fusedCurrentVehicle = {
          lat: currentVehicle.lat,
          lng: currentVehicle.lng,
          bearing: currentVehicle.bearing ?? 0,
          tripId: currentRideLeg.tripId,
        };
      } else if (onBoardCurrent && fix) {
        vehicleLost = true;
        fusedCurrentVehicle = {
          lat: fix.lat,
          lng: fix.lng,
          bearing: fix.headingDeg ?? 0,
          tripId: currentRideLeg.tripId,
        };
      }
    }
    const nextVehicleTracked = nextRideLeg
      ? !!rt?.vehicles.find((v) => v.tripId === nextRideLeg.tripId)
      : false;

    // Distance-floored alight ETA.
    let fusedSecsToCurrentAlight = secsToCurrentAlight;
    if (onBoardCurrent && fusedCurrentVehicle && currentRideLeg) {
      const alightLoc = {
        lat: currentRideLeg.alight.lat,
        lng: currentRideLeg.alight.lng,
      };
      const distToAlight = distanceM(fusedCurrentVehicle, alightLoc);
      const FLOOR_SPEED_MPS = 11;
      const minPossibleEta = Math.round(distToAlight / FLOOR_SPEED_MPS);
      const gpsSpeed = fix?.speedMps ?? 0;
      if (vehicleLost) {
        const speed = gpsSpeed > 2 ? gpsSpeed : 6;
        fusedSecsToCurrentAlight = Math.max(
          minPossibleEta,
          Math.round(distToAlight / speed),
        );
      } else if (gpsSpeed > 2) {
        const gpsEta = Math.round(distToAlight / Math.max(3, gpsSpeed));
        fusedSecsToCurrentAlight = Math.max(
          minPossibleEta,
          Math.round(0.6 * gpsEta + 0.4 * secsToCurrentAlight),
        );
      } else {
        fusedSecsToCurrentAlight = Math.max(minPossibleEta, secsToCurrentAlight);
      }
      fusedSecsToCurrentAlight = Math.max(0, fusedSecsToCurrentAlight);
    }

    if (
      (phase === "waiting-for-connection" || phase === "walking-to-transfer") &&
      nextRideLeg &&
      nextBoardUnix > 0 &&
      now - nextBoardUnix > MISSED_CONNECTION_BUFFER_S
    ) {
      phase = "missed-connection";
    }

    return {
      active: true,
      fix,
      phase,
      currentLegIndex: idx,
      currentLeg,
      nextLeg,
      currentRideLeg,
      nextRideLeg,
      rideOrdinal: currentRideOrdinal,
      totalRides,
      secsToCurrentBoard,
      secsToCurrentAlight: fusedSecsToCurrentAlight,
      secsToNextBoard,
      nextBoardSource,
      nextBoardLate,
      metersToTarget,
      fusedCurrentVehicle,
      vehicleLost,
      feedStale,
      tripGhost: !!(
        currentRideLeg && rtQuery.ghostTripIds?.has(currentRideLeg.tripId)
      ),
      nextVehicleTracked,
    };
  }, [itin, legState, started, fix, rt, feedStale, rtQuery.ghostTripIds]);

  // ---- Auto-advance walk/wait legs -----------------------------------------
  useEffect(() => {
    if (!result.active || !itin || !legState) return;
    const idx = result.currentLegIndex;
    const leg = result.currentLeg;
    if (!leg) return;

    if (leg.kind === "walk") {
      const isFinal = idx === itin.legs.length - 1;
      if (isFinal) return;
      if (result.fix && result.metersToTarget < STOP_ARRIVAL_RADIUS_M) {
        advanceToNextLeg();
      } else {
        const enteredAt = legState.perLeg[idx]?.enteredAt;
        if (enteredAt) {
          const elapsed = (Date.now() - enteredAt) / 1000;
          if (elapsed > leg.durationSec + 120) advanceToNextLeg();
        }
      }
    }
    if (leg.kind === "wait") {
      const enteredAt = legState.perLeg[idx]?.enteredAt;
      if (enteredAt) {
        const elapsed = (Date.now() - enteredAt) / 1000;
        if (elapsed > Math.max(0, leg.durationSec - 30)) advanceToNextLeg();
      }
    }
    if (leg.kind === "ride") {
      const p = legState.perLeg[idx];
      if (p?.alightedAt) advanceToNextLeg();
    }
  }, [
    result.active,
    result.currentLegIndex,
    result.currentLeg,
    result.fix,
    result.metersToTarget,
    itin,
    legState,
  ]);

  // ---- GPS auto-confirm boarding on ride legs ------------------------------
  const ridingStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!result.active || !legState) {
      ridingStartedAtRef.current = null;
      return;
    }
    const leg = result.currentLeg;
    if (!leg || leg.kind !== "ride") {
      ridingStartedAtRef.current = null;
      return;
    }
    const per = legState.perLeg[result.currentLegIndex];
    if (per?.onBoardConfirmedAt || per?.alightedAt || per?.missedAt) {
      ridingStartedAtRef.current = null;
      return;
    }
    const speed = result.fix?.speedMps ?? 0;
    if (speed <= RIDING_SPEED_MPS) {
      ridingStartedAtRef.current = null;
      return;
    }
    const boardLoc = result.currentRideLeg
      ? {
          lat: result.currentRideLeg.board.lat,
          lng: result.currentRideLeg.board.lng,
        }
      : null;
    const departed =
      !!result.fix &&
      !!boardLoc &&
      distanceM(result.fix, boardLoc) > RIDING_DISPLACEMENT_M;
    if (!departed) {
      ridingStartedAtRef.current = null;
      return;
    }
    if (ridingStartedAtRef.current == null) {
      ridingStartedAtRef.current = Date.now();
      return;
    }
    if (Date.now() - ridingStartedAtRef.current >= SUSTAINED_RIDING_MS) {
      patchCurrentLeg({ onBoardConfirmedAt: Date.now() });
      ridingStartedAtRef.current = null;
    }
  }, [
    result.active,
    result.currentLegIndex,
    result.currentLeg,
    result.currentRideLeg,
    result.fix,
    legState,
  ]);

  // ---- Local one-shot alerts on phase transitions --------------------------
  const sentRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!result.active || !active || !itin) return;
    const url = `/trip/${active.option.id}`;
    const fireOnce = (
      key: string,
      payload: Parameters<typeof sendLocalTripAlert>[0],
    ) => {
      if (sentRef.current.has(key)) return;
      sentRef.current.add(key);
      void sendLocalTripAlert({ ...payload, url });
    };

    if (result.phase === "alight-soon" && result.currentRideLeg) {
      fireOnce(`press-stop:${result.currentLegIndex}`, {
        kind: "press-stop",
        routeShort: result.currentRideLeg.routeShort,
        stopName: result.currentRideLeg.alight.name,
      });
    }
    if (result.phase === "walking-to-transfer" && result.nextRideLeg) {
      fireOnce(`walk-transfer:${result.currentLegIndex}`, {
        kind: "at-stop",
        routeShort: result.nextRideLeg.routeShort,
        stopName: result.nextRideLeg.board.name,
        minutes: Math.max(0, Math.round(result.secsToNextBoard / 60)),
      });
    }
    if (
      result.phase === "waiting-for-connection" &&
      result.nextRideLeg &&
      result.secsToNextBoard <= 90 &&
      result.secsToNextBoard > 0
    ) {
      fireOnce(`connection-arriving:${result.currentLegIndex}`, {
        kind: "at-stop",
        routeShort: result.nextRideLeg.routeShort,
        stopName: result.nextRideLeg.board.name,
        minutes: Math.max(1, Math.round(result.secsToNextBoard / 60)),
      });
    }
    if (result.nextBoardLate && result.nextRideLeg) {
      fireOnce(`connection-late:${result.currentLegIndex}`, {
        kind: "hurry-soft",
        routeShort: result.nextRideLeg.routeShort,
        stopName: result.nextRideLeg.board.name,
        minutes: Math.max(0, Math.round(result.secsToNextBoard / 60)),
      });
    }
    if (result.phase === "missed-connection" && result.nextRideLeg) {
      fireOnce(`missed-connection:${result.currentLegIndex}`, {
        kind: "missed-bus",
        routeShort: result.nextRideLeg.routeShort,
        stopName: result.nextRideLeg.board.name,
      });
    }
    if (result.phase === "arrived") {
      fireOnce("arrived", { kind: "arrived" });
    }
  }, [
    result.active,
    result.phase,
    result.currentLegIndex,
    result.secsToNextBoard,
    result.nextBoardLate,
    result.currentRideLeg,
    result.nextRideLeg,
    active,
    itin,
  ]);

  return result;
}

// ---- Action helpers exposed to MultiLegCompanion -------------------------

export function multiLegConfirmOnBoard() {
  patchCurrentLeg({ onBoardConfirmedAt: Date.now() });
}
export function multiLegMarkAlighted() {
  patchCurrentLeg({ alightedAt: Date.now() });
}
export function multiLegMarkArrived() {
  patchCurrentLeg({ arrivedAt: Date.now() });
}
export function multiLegMarkMissed() {
  patchCurrentLeg({ missedAt: Date.now() });
}
