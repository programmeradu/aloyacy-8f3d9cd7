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
import { useDriveEta } from "./useDriveEta";
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

  // Compute on-board + current ride / alight target outside the main memo
  // so we can feed them to the Google Routes drive-ETA hook (which can't
  // run inside useMemo).
  const driveInputs = useMemo(() => {
    if (!itin || !legState) return { onBoard: false, busPos: null, alightLoc: null, tripId: null };
    const idx = Math.min(legState.currentLegIndex, itin.legs.length - 1);
    const currentLeg = itin.legs[idx];
    const per = legState.perLeg[idx] ?? {};
    if (!currentLeg || currentLeg.kind !== "ride") {
      return { onBoard: false, busPos: null, alightLoc: null, tripId: null };
    }
    const onBoard = !!per.onBoardConfirmedAt && !per.alightedAt;
    if (!onBoard) return { onBoard: false, busPos: null, alightLoc: null, tripId: null };
    const v = rt?.vehicles.find((x) => x.tripId === currentLeg.tripId);
    const busPos = v
      ? { lat: v.lat, lng: v.lng }
      : fix
        ? { lat: fix.lat, lng: fix.lng }
        : null;
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
        // For the final egress walk we require BOTH proximity to the
        // destination AND evidence the rider has actually walked — either
        // moved meaningfully away from the alight stop, or stayed in the leg
        // long enough that a stale GPS fix isn't the trigger. Without these
        // guards, "I'm off" can flip straight to "arrived" if the destination
        // address happens to be close to the alight stop or if GPS still
        // reports the rider's last on-board position. The rider can always
        // tap "I'm here" to force the arrived state (perLeg.arrivedAt).
        const manualArrived =
          phase === "walking-to-destination" && !!legState.perLeg[idx]?.arrivedAt;
        const within =
          fix &&
          metersToTarget <
            (phase === "walking-to-destination"
              ? DEST_ARRIVAL_RADIUS_M
              : STOP_ARRIVAL_RADIUS_M);
        let arrivedHere = within;
        if (within && phase === "walking-to-destination") {
          const enteredAt = legState.perLeg[idx]?.enteredAt ?? 0;
          const secsInLeg = enteredAt ? (Date.now() - enteredAt) / 1000 : 0;
          const distFromAlightStop = fix
            ? distanceM(fix, { lat: currentLeg.from.lat, lng: currentLeg.from.lng })
            : 0;
          const walkedAway = distFromAlightStop > 40;
          const waitedEnough = secsInLeg > 45;
          arrivedHere = walkedAway || waitedEnough;
        }
        if (manualArrived || arrivedHere) {
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

    // ---- GPS vehicle fallback (on-board, current ride) --------------------
    // When the rider is on board the current ride but its tripId disappears
    // from the live feed, drive the bus marker from their phone GPS.
    const currentVehicle =
      currentRideLeg
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
        // Feed lost it — fall back to rider GPS. The rider IS the bus.
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

    // ---- ETA distance floor (on-board only) -------------------------------
    // The schedule-based countdown ticks down even when the bus is dwelling
    // at a stop. Clamp it by what's physically possible given the remaining
    // distance to the alight point, so the ETA freezes when we're not
    // actually getting closer.
    let fusedSecsToCurrentAlight = secsToCurrentAlight;
    if (onBoardCurrent && fusedCurrentVehicle && currentRideLeg) {
      const alightLoc = { lat: currentRideLeg.alight.lat, lng: currentRideLeg.alight.lng };
      const distToAlight = distanceM(fusedCurrentVehicle, alightLoc);
      const FLOOR_SPEED_MPS = 11; // ~40 km/h optimistic urban+intercity
      const minPossibleEta = Math.round(distToAlight / FLOOR_SPEED_MPS);
      const gpsSpeed = fix?.speedMps ?? 0;
      if (drive.etaSec != null && driveInputs.tripId === currentRideLeg.tripId) {
        // Google Routes drive ETA (traffic-aware, road-following) is the
        // source of truth when available.
        fusedSecsToCurrentAlight = Math.max(minPossibleEta, drive.etaSec);
      } else if (vehicleLost) {
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
        // Bus stopped — freeze ETA at the distance floor.
        fusedSecsToCurrentAlight = Math.max(minPossibleEta, secsToCurrentAlight);
      }
      fusedSecsToCurrentAlight = Math.max(0, fusedSecsToCurrentAlight);
    }

    // ---- Missed-connection detection --------------------------------------
    // We're waiting at the transfer stop, the scheduled (or live) departure
    // has passed by MISSED_CONNECTION_BUFFER_S, and rider hasn't confirmed
    // boarding the next ride. Surface a rescue path.
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
      nextVehicleTracked,
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
export function multiLegMarkArrived() {
  patchCurrentLeg({ arrivedAt: Date.now() });
}
export function multiLegMarkMissed() {
  patchCurrentLeg({ missedAt: Date.now() });
}


// Type re-exports for convenience.
export type { Leg, RideLeg, WalkLeg, WaitLeg };
