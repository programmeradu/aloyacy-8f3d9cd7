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
import {
  fuseAlightEta,
  fuseRideVehicle,
  isConnectionLate,
  legTarget,
  multiLegAlerts,
  resolveLegs,
  resolveMultiLegPhase,
  shouldAdvanceLeg,
  shouldAutoConfirmRide,
} from "@aloya/core/multileg-journey";

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

  const tick = useTick(5_000); // keeps countdowns moving between fixes

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
    const res = resolveLegs(itin.legs as Leg[], legState.currentLegIndex);
    const { index: idx, currentLeg, nextLeg, currentRideLeg, connectionRideLeg } = res;
    const per = legState.perLeg[idx] ?? {};

    const liveFor = (r: RideLeg | null, stopId: string | undefined) =>
      r && stopId
        ? rt?.arrivals.find((a) => a.tripId === r.tripId && a.stopId === stopId)
        : undefined;

    const liveCurBoard = liveFor(currentRideLeg, currentRideLeg?.board.stopId);
    const liveCurAlight = liveFor(currentRideLeg, currentRideLeg?.alight.stopId);
    const liveNextBoard = liveFor(connectionRideLeg, connectionRideLeg?.board.stopId);

    const curBoardUnix =
      liveCurBoard?.arrivalUnix ?? currentRideLeg?.board.departureUnix ?? 0;
    const curAlightUnix =
      liveCurAlight?.arrivalUnix ?? currentRideLeg?.alight.arrivalUnix ?? 0;
    const nextBoardUnix =
      liveNextBoard?.arrivalUnix ?? connectionRideLeg?.board.departureUnix ?? 0;

    const secsToCurrentBoard = curBoardUnix ? curBoardUnix - now : 0;
    const secsToCurrentAlight = curAlightUnix ? curAlightUnix - now : 0;
    const secsToNextBoard = nextBoardUnix ? nextBoardUnix - now : 0;
    const nextBoardSource: "live" | "scheduled" = liveNextBoard ? "live" : "scheduled";
    const nextBoardLate = isConnectionLate(
      liveNextBoard?.arrivalUnix ?? null,
      connectionRideLeg?.board.departureUnix ?? null,
    );

    const target = legTarget(currentLeg);
    const metersToTarget = fix && target ? distanceM(fix, target) : 0;

    const phase = resolveMultiLegPhase({
      nowUnix: now,
      nowMs: Date.now(),
      fix,
      resolution: res,
      per,
      metersToTarget,
      secsToCurrentAlight,
      nextBoardUnix,
    });

    const currentVehicle = currentRideLeg
      ? (rt?.vehicles.find((v) => v.tripId === currentRideLeg.tripId) ?? null)
      : null;
    const onBoardCurrent =
      !!per.onBoardConfirmedAt && !per.alightedAt && currentLeg?.kind === "ride";
    const { fusedCurrentVehicle, vehicleLost } = fuseRideVehicle({
      currentRideLeg,
      vehicle: currentVehicle,
      fix,
      onBoard: onBoardCurrent,
    });
    const nextVehicleTracked = connectionRideLeg
      ? !!rt?.vehicles.find((v) => v.tripId === connectionRideLeg.tripId)
      : false;

    const fusedSecsToCurrentAlight = fuseAlightEta({
      onBoard: onBoardCurrent,
      fusedVehicle: fusedCurrentVehicle,
      alightLoc: currentRideLeg
        ? { lat: currentRideLeg.alight.lat, lng: currentRideLeg.alight.lng }
        : null,
      secsToAlight: secsToCurrentAlight,
      gpsSpeedMps: fix?.speedMps ?? 0,
      vehicleLost,
      // TODO: blend the Routes drive-ETA once /api/public/drive-eta is wired
      // on device; web already passes it here.
      driveEtaSec: null,
    });

    return {
      active: true,
      fix,
      phase,
      currentLegIndex: idx,
      currentLeg,
      nextLeg,
      currentRideLeg,
      // The UI's "next bus" is always the one being connected to.
      nextRideLeg: connectionRideLeg,
      rideOrdinal: res.rideOrdinal,
      totalRides: res.totalRides,
      secsToCurrentBoard,
      secsToCurrentAlight: fusedSecsToCurrentAlight,
      secsToNextBoard,
      nextBoardSource,
      nextBoardLate,
      metersToTarget,
      fusedCurrentVehicle,
      vehicleLost,
      feedStale,
      tripGhost: !!(currentRideLeg && rtQuery.ghostTripIds?.has(currentRideLeg.tripId)),
      nextVehicleTracked,
    };
    // `tick` is a deliberate heartbeat that forces countdown recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itin, legState, started, fix, rt, feedStale, rtQuery.ghostTripIds, tick]);

  // ---- Auto-advance walk/wait legs -----------------------------------------
  useEffect(() => {
    if (!result.active || !itin || !legState) return;
    const idx = result.currentLegIndex;
    if (
      shouldAdvanceLeg({
        leg: result.currentLeg,
        isFinalLeg: idx === itin.legs.length - 1,
        hasFix: !!result.fix,
        metersToTarget: result.metersToTarget,
        enteredAt: legState.perLeg[idx]?.enteredAt ?? null,
        per: legState.perLeg[idx] ?? {},
        nowMs: Date.now(),
      })
    ) {
      advanceToNextLeg();
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
    const next = shouldAutoConfirmRide({
      leg: result.currentLeg,
      per: legState.perLeg[result.currentLegIndex] ?? {},
      fix: result.fix,
      boardLoc: result.currentRideLeg
        ? { lat: result.currentRideLeg.board.lat, lng: result.currentRideLeg.board.lng }
        : null,
      ridingSinceMs: ridingStartedAtRef.current,
      nowMs: Date.now(),
    });
    ridingStartedAtRef.current = next.ridingSinceMs;
    if (next.confirm) patchCurrentLeg({ onBoardConfirmedAt: Date.now() });
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
    for (const alert of multiLegAlerts({
      phase: result.phase,
      legIndex: result.currentLegIndex,
      currentRideLeg: result.currentRideLeg,
      nextRideLeg: result.nextRideLeg,
      secsToNextBoard: result.secsToNextBoard,
      nextBoardLate: result.nextBoardLate,
    })) {
      if (sentRef.current.has(alert.key)) continue;
      sentRef.current.add(alert.key);
      void sendLocalTripAlert({
        kind: alert.kind,
        url,
        ...(alert.routeShort ? { routeShort: alert.routeShort } : {}),
        ...(alert.stopName ? { stopName: alert.stopName } : {}),
        ...(alert.minutes != null ? { minutes: alert.minutes } : {}),
      });
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
