// Multi-leg journey orchestrator. Mirrors `useJourney` (single-leg) but
// walks the rider through a full itinerary with N ride legs, transfer walks,
// and connection waits. The single-leg hook stays in place for back-compat;
// this one only activates when `active.itinerary` has ≥ 2 ride legs.
//
// Phase machine (mirrors .lovable/plan.md):
//
//   walking_to_board (leg 0: walk)
//     → waiting_to_board    (we're at the stop, ride hasn't departed)
//     → riding              (ride leg in progress)
//     → walking_to_transfer (walk leg between rides)
//     → waiting_for_connection (wait leg)
//     → riding              (next ride leg)
//     → ... up to 3 rides ...
//     → walking_to_destination (last walk leg)
//     → arrived

import { useEffect, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtime } from "./useRealtime";
import type { LiveFix } from "./useGeoWatch";
import { useFusedFix } from "./useFusedFix";
import { distanceM } from "./geo";
import { useDriveEta } from "./useDriveEta";
import { advanceToNextLeg, patchCurrentLeg, type ActiveTrip } from "./trip-store";
import type { Leg, RideLeg, WalkLeg, WaitLeg } from "./itinerary-types";
import { getDeviceId } from "./pwa";
import { sendTripAlert } from "./push.functions";
import { useRiderFixReporter } from "./useRiderFixReporter";
import { detectWrongStop, type RerouteHint } from "./wrong-stop-reroute";
import { recordCommutePattern } from "./commute-learner.functions";

import type { JourneyPhase } from "./journey-phase";
export type { JourneyPhase } from "./journey-phase";

/** @deprecated use JourneyPhase from "@/lib/journey-phase" */
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

export type MultiLegLive = {
  active: boolean;
  fix: LiveFix | null;
  phase: MultiLegPhase;
  /** Index into itinerary.legs of the leg currently being executed. */
  currentLegIndex: number;
  /** The leg currently being executed. */
  currentLeg: Leg | null;
  /** The next leg (used to render "next up" copy). */
  nextLeg: Leg | null;
  /** The ride leg the rider is on / about to board. */
  currentRideLeg: RideLeg | null;
  /** The ride leg AFTER the current one (transfer target). Used for the
   *  "your connecting bus" callouts and the dual-vehicle map indicator. */
  nextRideLeg: RideLeg | null;
  /** 1-indexed position of the current/last ride within all ride legs. */
  rideOrdinal: number;
  /** Total number of ride legs in the itinerary. */
  totalRides: number;
  /** Seconds until the current ride leg departs (live-overlay aware). */
  secsToCurrentBoard: number;
  /** Seconds until the current ride leg alights (live-overlay aware). */
  secsToCurrentAlight: number;
  /** Seconds until the NEXT ride leg departs (for connection countdown). */
  secsToNextBoard: number;
  /** Live source of the next ride's ETA: "live" if from realtime feed,
   *  "scheduled" otherwise. Surface honestly in the UI. */
  nextBoardSource: "live" | "scheduled";
  /** True when the connecting bus is running ≥ 5 min late vs scheduled. */
  nextBoardLate: boolean;
  /** Meters to the current leg's spatial target (board stop / transfer
   *  stop / destination). */
  metersToTarget: number;
  /** Fused position of the current ride's bus (GPS fallback when feed lost). */
  fusedCurrentVehicle: { lat: number; lng: number; bearing: number; tripId: string } | null;
  /** True while on-board the current ride but its tripId is not in the feed. */
  vehicleLost: boolean;
  /** True when the realtime feed itself is stale. */
  feedStale: boolean;
  /** True when the current ride's trip is flagged ghost (no fresh GPS ≥ 180s). */
  tripGhost: boolean;
  /** True when the next ride's vehicle has not started reporting yet. */
  nextVehicleTracked: boolean;

  /** Wrong-stop adaptive hint while walking to the planned board stop. */
  rerouteHint: RerouteHint;
};

export function useMultiLegJourney(active: ActiveTrip | null): MultiLegLive {
  const itin = active?.itinerary ?? null;
  const legState = active?.legState ?? null;
  const started = !!active?.live?.startedAt;

  const { fix: fusedFix } = useFusedFix({ enabled: started });
  const fix: LiveFix | null = useMemo(() => {
    if (!fusedFix) return null;
    return {
      lat: fusedFix.lat,
      lng: fusedFix.lng,
      accuracyM: fusedFix.uncertaintyM,
      speedMps: fusedFix.speedMps,
      headingDeg: fusedFix.bearingDeg,
      timestamp: fusedFix.timestamp,
    };
  }, [fusedFix]);
  const { data: rt, isStale: feedStale } = useRealtime();

  // Compute on-board + current ride / alight target outside the main memo
  // so we can feed them to the Google Routes drive-ETA hook (which can't
  // run inside useMemo).
  const driveInputs = useMemo(() => {
    const none = { onBoard: false, busPos: null, alightLoc: null, tripId: null } as const;
    if (!itin || !legState) return none;
    const { currentLeg, index } = resolveLegs(itin.legs, legState.currentLegIndex);
    const per = legState.perLeg[index] ?? {};
    if (!currentLeg || currentLeg.kind !== "ride") return none;
    const onBoard = !!per.onBoardConfirmedAt && !per.alightedAt;
    if (!onBoard) return none;
    const v = rt?.vehicles.find((x) => x.tripId === currentLeg.tripId);
    const busPos = v ? { lat: v.lat, lng: v.lng } : fix ? { lat: fix.lat, lng: fix.lng } : null;
    return {
      onBoard,
      busPos,
      alightLoc: { lat: currentLeg.alight.lat, lng: currentLeg.alight.lng },
      tripId: currentLeg.tripId,
    };
  }, [itin, legState, rt, fix]);
  const drive = useDriveEta({
    enabled: driveInputs.onBoard && !!driveInputs.busPos && !!driveInputs.alightLoc,
    from: driveInputs.busPos,
    to: driveInputs.alightLoc,
  });

  const result = useMemo<MultiLegLive>(() => {
    const baseInactive: MultiLegLive = {
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

      rerouteHint: null,
    };

    if (!itin || !legState || !started) return baseInactive;

    const now = Math.floor(Date.now() / 1000);
    const res = resolveLegs(itin.legs, legState.currentLegIndex);
    const { index: idx, currentLeg, nextLeg, currentRideLeg, connectionRideLeg } = res;
    const per = legState.perLeg[idx] ?? {};

    // Live-overlay ETAs.
    const liveFor = (r: RideLeg | null, stopId: string | undefined) =>
      r && stopId ? rt?.arrivals.find((a) => a.tripId === r.tripId && a.stopId === stopId) : undefined;

    const liveCurBoard = liveFor(currentRideLeg, currentRideLeg?.board.stopId);
    const liveCurAlight = liveFor(currentRideLeg, currentRideLeg?.alight.stopId);
    const liveNextBoard = liveFor(connectionRideLeg, connectionRideLeg?.board.stopId);

    const curBoardUnix = liveCurBoard?.arrivalUnix ?? currentRideLeg?.board.departureUnix ?? 0;
    const curAlightUnix = liveCurAlight?.arrivalUnix ?? currentRideLeg?.alight.arrivalUnix ?? 0;
    const nextBoardUnix = liveNextBoard?.arrivalUnix ?? connectionRideLeg?.board.departureUnix ?? 0;

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

    // ---- GPS vehicle fallback (on-board, current ride) --------------------
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

    // ---- ETA distance floor (on-board only) -------------------------------
    const fusedSecsToCurrentAlight = fuseAlightEta({
      onBoard: onBoardCurrent,
      fusedVehicle: fusedCurrentVehicle,
      alightLoc: currentRideLeg
        ? { lat: currentRideLeg.alight.lat, lng: currentRideLeg.alight.lng }
        : null,
      secsToAlight: secsToCurrentAlight,
      gpsSpeedMps: fix?.speedMps ?? 0,
      vehicleLost,
      driveEtaSec:
        drive.etaSec != null && driveInputs.tripId === currentRideLeg?.tripId ? drive.etaSec : null,
    });

    // ---- Wrong-stop reroute hint (Google-Maps-style) --------------------
    let rerouteHint: RerouteHint = null;
    if ((phase === "walking-to-board" || phase === "waiting-to-board") && currentRideLeg && fix) {
      rerouteHint = detectWrongStop({
        fixLat: fix.lat,
        fixLng: fix.lng,
        routeId: currentRideLeg.routeId,
        plannedBoardStopId: currentRideLeg.board.stopId,
        plannedAlightStopId: currentRideLeg.alight.stopId,
      });
    }

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
      tripGhost: !!(
        currentRideLeg &&
        rt?.ghostTripIds &&
        rt.ghostTripIds.includes(currentRideLeg.tripId)
      ),

      nextVehicleTracked,

      rerouteHint,
    };
  }, [itin, legState, started, fix, rt, feedStale, drive.etaSec, driveInputs.tripId]);

  // ---- Auto-advance the phase machine for walk/wait legs ------------------
  // Ride legs require explicit user tap ("I'm on board", "I'm off"); walks
  // and waits advance automatically once their preconditions are met.
  useEffect(() => {
    if (!result.active || !itin || !legState) return;
    const idx = result.currentLegIndex;
    const leg = result.currentLeg;
    if (!leg) return;

    // Walk leg auto-advance when GPS arrives at target (unless it's the
    // final egress walk — that ends at "arrived").
    if (leg.kind === "walk") {
      const isFinal = idx === itin.legs.length - 1;
      if (isFinal) return; // egress; UI handles "arrived" → done
      const radius = STOP_ARRIVAL_RADIUS_M;
      if (result.fix && result.metersToTarget < radius) {
        advanceToNextLeg();
      } else {
        // Failsafe: if walk duration has long elapsed since entering this
        // leg, advance anyway so a missing/poor GPS doesn't strand the rider.
        const enteredAt = legState.perLeg[idx]?.enteredAt;
        if (enteredAt && leg.kind === "walk") {
          const elapsed = (Date.now() - enteredAt) / 1000;
          if (elapsed > leg.durationSec + 120) advanceToNextLeg();
        }
      }
    }

    // Wait leg auto-advance when the wait window is up. The actual onboard
    // confirmation happens via the user tap on the next (ride) leg.
    if (leg.kind === "wait") {
      const enteredAt = legState.perLeg[idx]?.enteredAt;
      if (enteredAt) {
        const elapsed = (Date.now() - enteredAt) / 1000;
        // Move forward 30 s before the wait ends so the ride-leg UI is
        // visible by the time the bus arrives.
        if (elapsed > Math.max(0, leg.durationSec - 30)) advanceToNextLeg();
      }
    }

    // Ride leg auto-advance when rider tapped alighted.
    if (leg.kind === "ride") {
      const per = legState.perLeg[idx];
      if (per?.alightedAt) advanceToNextLeg();
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

  // ---- GPS-based auto-confirm boarding on ride legs ----------------------
  // Mirrors useJourney: if the rider's GPS shows sustained bus-speed motion
  // AND they've left the board stop while a ride leg is active but unconfirmed,
  // mark them on-board automatically. Covers the feed-blackout failure mode.
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
      ? { lat: result.currentRideLeg.board.lat, lng: result.currentRideLeg.board.lng }
      : null;
    const departed =
      !!result.fix && !!boardLoc && distanceM(result.fix, boardLoc) > RIDING_DISPLACEMENT_M;
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

  // ---- Push alerts on phase transition ------------------------------------
  // Idempotent via a per-(legIdx,kind) key set. The server-side cron also
  // fires the same alerts in the background; this client-side path covers
  // the foreground (tab open, GPS hot) case so the rider gets near-instant
  // nudges and not just the 60 s cron tick.
  const sentRef = useRef<Set<string>>(new Set());
  const sendAlert = useServerFn(sendTripAlert);

  useEffect(() => {
    if (!result.active || !active || !itin) return;
    const deviceId = getDeviceId();
    const url = `/trip/${active.option.id}`;
    const fireOnce = (key: string, fn: () => void) => {
      if (sentRef.current.has(key)) return;
      sentRef.current.add(key);
      fn();
    };

    if (result.phase === "alight-soon" && result.currentRideLeg) {
      fireOnce(`press-stop:${result.currentLegIndex}`, () =>
        sendAlert({
          data: {
            deviceId,
            kind: "press-stop",
            routeShort: result.currentRideLeg!.routeShort,
            stopName: result.currentRideLeg!.alight.name,
            url,
          },
        }).catch(() => {}),
      );
    }
    if (result.phase === "walking-to-transfer" && result.nextRideLeg) {
      fireOnce(`walk-transfer:${result.currentLegIndex}`, () =>
        sendAlert({
          data: {
            deviceId,
            kind: "at-stop",
            routeShort: result.nextRideLeg!.routeShort,
            stopName: result.nextRideLeg!.board.name,
            minutes: Math.max(0, Math.round(result.secsToNextBoard / 60)),
            url,
          },
        }).catch(() => {}),
      );
    }
    if (
      result.phase === "waiting-for-connection" &&
      result.nextRideLeg &&
      result.secsToNextBoard <= 90 &&
      result.secsToNextBoard > 0
    ) {
      fireOnce(`connection-arriving:${result.currentLegIndex}`, () =>
        sendAlert({
          data: {
            deviceId,
            kind: "at-stop",
            routeShort: result.nextRideLeg!.routeShort,
            stopName: result.nextRideLeg!.board.name,
            minutes: Math.max(1, Math.round(result.secsToNextBoard / 60)),
            url,
          },
        }).catch(() => {}),
      );
    }
    if (result.nextBoardLate && result.nextRideLeg) {
      fireOnce(`connection-late:${result.currentLegIndex}`, () =>
        sendAlert({
          data: {
            deviceId,
            kind: "hurry-soft",
            routeShort: result.nextRideLeg!.routeShort,
            stopName: result.nextRideLeg!.board.name,
            minutes: Math.max(0, Math.round(result.secsToNextBoard / 60)),
            url,
          },
        }).catch(() => {}),
      );
    }
    if (result.phase === "arrived") {
      fireOnce(`arrived`, () =>
        sendAlert({
          data: { deviceId, kind: "arrived", url },
        }).catch(() => {}),
      );
    }
  }, [
    result.active,
    result.phase,
    result.currentLegIndex,
    result.secsToNextBoard,
    result.nextBoardLate,
    active,
    itin,
    sendAlert,
    result.currentRideLeg,
    result.nextRideLeg,
  ]);

  // ---- Crowdsourced bus position: report rider GPS while on board --------
  useRiderFixReporter({
    enabled: result.active && !!result.currentRideLeg && driveInputs.onBoard,
    fix: result.fix,
    tripId: result.currentRideLeg?.tripId ?? null,
    routeId: result.currentRideLeg?.routeId,
  });

  // ---- Commute pattern learner: record once on arrival ------------------
  const recordCommute = useServerFn(recordCommutePattern);
  const recordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (result.phase !== "arrived" || !itin || !active) return;
    const key = active.option.id;
    if (recordedRef.current === key) return;
    const rideLegs = itin.legs.filter((l): l is RideLeg => l.kind === "ride");
    if (rideLegs.length === 0) return;
    const first = rideLegs[0];
    const last = rideLegs[rideLegs.length - 1];
    recordedRef.current = key;
    recordCommute({
      data: {
        fromLat: first.board.lat,
        fromLng: first.board.lng,
        toLat: last.alight.lat,
        toLng: last.alight.lng,
        fromLabel: first.board.name,
        toLabel: last.alight.name,
        startedAtUnix: Math.floor((active.live?.startedAt ?? Date.now()) / 1000),
      },
    }).catch(() => {
      // Best-effort; not signed in → silently skip.
      recordedRef.current = null;
    });
  }, [result.phase, itin, active, recordCommute]);

  return result;
}

// ---- Action helpers exposed to MultiLegCompanion -------------------------

export function multiLegConfirmOnBoard() {
  patchCurrentLeg({ onBoardConfirmedAt: Date.now() });
}
export function multiLegMarkAlighted() {
  patchCurrentLeg({ alightedAt: Date.now() });
  // The auto-advance effect will move to the next leg on the next tick.
}
export function multiLegMarkArrived() {
  patchCurrentLeg({ arrivedAt: Date.now() });
}
export function multiLegMarkMissed() {
  patchCurrentLeg({ missedAt: Date.now() });
}

// Type re-exports for convenience.
export type { Leg, RideLeg, WalkLeg, WaitLeg };
