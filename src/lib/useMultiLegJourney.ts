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
import { useGeoWatch, type LiveFix } from "./useGeoWatch";
import { distanceM } from "./geo";
import {
  advanceToNextLeg,
  patchCurrentLeg,
  type ActiveTrip,
} from "./trip-store";
import type { Leg, RideLeg, WalkLeg, WaitLeg } from "./itinerary-types";
import { getDeviceId } from "./pwa";
import { sendTripAlert } from "./push.functions";

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
  /** True when the next ride's vehicle has not started reporting yet. */
  nextVehicleTracked: boolean;
};

const STOP_ARRIVAL_RADIUS_M = 30;
const DEST_ARRIVAL_RADIUS_M = 30;
const CONNECTION_LATE_S = 5 * 60;
const RIDING_SPEED_MPS = 5;
/** How long after the scheduled connection departure we call it "missed". */
const MISSED_CONNECTION_BUFFER_S = 90;

export function useMultiLegJourney(active: ActiveTrip | null): MultiLegLive {
  const itin = active?.itinerary ?? null;
  const legState = active?.legState ?? null;
  const started = !!active?.live?.startedAt;

  const { fix } = useGeoWatch(started);
  const { data: rt, isStale: feedStale } = useRealtime();


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
      nextVehicleTracked: false,
    };

    if (!itin || !legState || !started) return baseInactive;


    const now = Math.floor(Date.now() / 1000);
    const idx = Math.min(legState.currentLegIndex, itin.legs.length - 1);
    const currentLeg = itin.legs[idx];
    const nextLeg = itin.legs[idx + 1] ?? null;
    const per = legState.perLeg[idx] ?? {};

    // Resolve current + next ride legs.
    const ridesAll = itin.legs
      .map((l, i) => (l.kind === "ride" ? { leg: l, i } : null))
      .filter((x): x is { leg: RideLeg; i: number } => x !== null);
    const totalRides = ridesAll.length;
    // Current ride: the one with i === idx (when riding) OR the next ride
    // ahead of the current walk/wait (when walking to it).
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

    // Live-overlay ETAs.
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
    const nextBoardSource: "live" | "scheduled" = liveNextBoard ? "live" : "scheduled";
    const nextBoardLate =
      !!liveNextBoard &&
      nextRideLeg !== null &&
      liveNextBoard.arrivalUnix - nextRideLeg.board.departureUnix >= CONNECTION_LATE_S;

    // Spatial target depends on leg kind.
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

    // Resolve phase from current leg + per-leg confirmations.
    let phase: MultiLegPhase = "idle";
    if (currentLeg) {
      if (currentLeg.kind === "walk") {
        // Is this the access walk (to first board), transfer walk, or egress?
        const ridesBeforeThis = ridesAll.filter((r) => r.i < idx).length;
        const ridesAfterThis = ridesAll.filter((r) => r.i > idx).length;
        if (ridesAfterThis === 0) phase = "walking-to-destination";
        else if (ridesBeforeThis === 0) phase = "walking-to-board";
        else phase = "walking-to-transfer";

        // Auto-advance on arrival.
        const arrivedHere =
          fix &&
          metersToTarget <
            (phase === "walking-to-destination"
              ? DEST_ARRIVAL_RADIUS_M
              : STOP_ARRIVAL_RADIUS_M);
        if (arrivedHere) {
          if (phase === "walking-to-destination") phase = "arrived";
          else if (phase === "walking-to-board") phase = "waiting-to-board";
          // walking-to-transfer → next leg (wait or ride) handled via effect.
        }
      } else if (currentLeg.kind === "wait") {
        phase = "waiting-for-connection";
      } else {
        // ride
        if (per.alightedAt) {
          // Past this ride — should have advanced already; treat as
          // transition state.
          phase = "alight-soon";
        } else if (per.onBoardConfirmedAt) {
          if (secsToCurrentAlight <= 60) phase = "alight-soon";
          else phase = "riding";
        } else {
          // Ride leg active but on-board not confirmed → still waiting.
          phase = "waiting-to-board";
        }
      }
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
      secsToCurrentAlight,
      secsToNextBoard,
      nextBoardSource,
      nextBoardLate,
      metersToTarget,
    };
  }, [itin, legState, started, fix, rt]);

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
  }, [result.active, result.currentLegIndex, result.currentLeg, result.fix, result.metersToTarget, itin, legState]);

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
export function multiLegMarkMissed() {
  patchCurrentLeg({ missedAt: Date.now() });
}

// Type re-exports for convenience.
export type { Leg, RideLeg, WalkLeg, WaitLeg };
