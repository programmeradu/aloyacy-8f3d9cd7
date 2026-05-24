// Live journey orchestrator. Reads continuous GPS + live realtime feed
// and derives a richer phase machine on top of the time-based one in
// trip.$id.tsx. Emits one-shot push alerts when phases transition.

import { useEffect, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtime } from "./useRealtime";
import { useGeoWatch, type LiveFix } from "./useGeoWatch";
import { useDriveEta } from "./useDriveEta";
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
  /** True when on-board confirmed but the bus disappeared from the live feed.
   *  We're falling back to the rider's own GPS as the vehicle position. */
  vehicleLost: boolean;
  /** True when the realtime feed itself is paused (proxy down, > 60 s stale). */
  feedStale: boolean;
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
  const { data: rt, isStale: feedStale } = useRealtime();


  const bus = useMemo(() => {
    if (!active) return null;
    const b = active.option.legs.find((l) => l.kind === "bus");
    return b && b.kind === "bus" ? b : null;
  }, [active]);

  const walkIn = active?.option.legs[0];
  const walkOut = active?.option.legs[active.option.legs.length - 1];

  // Best-effort live bus position for the drive-ETA query. Prefers the
  // realtime feed; falls back to the rider's GPS once they're on board
  // (the phone IS the bus). Recomputed only when inputs change.
  const onBoard = !!live?.onBoardConfirmedAt && !live?.alightedAt;
  const busPos = useMemo(() => {
    if (!bus) return null;
    const v = rt?.vehicles.find((x) => x.tripId === bus.tripId);
    if (v) return { lat: v.lat, lng: v.lng };
    if (onBoard && fix) return { lat: fix.lat, lng: fix.lng };
    return null;
  }, [bus, rt, onBoard, fix]);
  const alightLoc = useMemo(
    () =>
      walkOut?.kind === "walk"
        ? { lat: walkOut.from.lat, lng: walkOut.from.lng }
        : null,
    [walkOut],
  );
  const drive = useDriveEta({
    enabled: onBoard && !!busPos && !!alightLoc,
    from: busPos,
    to: alightLoc,
  });


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
      vehicleLost: false,
      feedStale,
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

    // ---- GPS × feed fusion (on-board only) ---------------------------------
    // Once the rider confirms they're on the bus, the phone IS the bus. We
    // weight the rider's GPS heavily against the (often 5–30s stale) vehicle
    // feed and re-derive the time-to-alight from the live distance + speed,
    // then blend that with the schedule-based estimate so the ETA stays
    // honest even if GPS speed flickers (tunnels, urban canyons).
    let fusedVehicle: LiveJourney["fusedVehicle"] = null;
    let fusedSecsToAlight = secsToAlight;
    let vehicleLost = false;
    // (outer scope already computed `onBoard`)
    if (onBoard && bus) {
      const gpsSpeed = fix?.speedMps ?? 0;
      const distToVehicle = fix && vehicle ? distanceM(fix, vehicle) : Infinity;
      const ridingWithBus =
        !!fix &&
        !!vehicle &&
        gpsSpeed > RIDING_SPEED_MPS &&
        distToVehicle < 250;

      if (vehicle && ridingWithBus && fix) {
        // Both signals agree the rider is on the bus → light blend that
        // smooths feed lag without overpowering it.
        fusedVehicle = {
          lat: fix.lat * 0.35 + vehicle.lat * 0.65,
          lng: fix.lng * 0.35 + vehicle.lng * 0.65,
          bearing:
            vehicle.bearing != null
              ? vehicle.bearing
              : gpsSpeed > 2 && fix.headingDeg != null
                ? fix.headingDeg
                : 0,
          tripId: bus.tripId,
        };
      } else if (vehicle) {
        // Rider hasn't proven they're on the bus → trust the feed verbatim.
        fusedVehicle = {
          lat: vehicle.lat,
          lng: vehicle.lng,
          bearing: vehicle.bearing ?? 0,
          tripId: bus.tripId,
        };
      } else if (fix) {
        // Feed lost the vehicle (proxy hiccup, vehicle dropped out of
        // service area, tripId churn). The rider IS the bus — drive the
        // marker from their phone GPS so the map keeps moving honestly.
        vehicleLost = true;
        fusedVehicle = {
          lat: fix.lat,
          lng: fix.lng,
          bearing: fix.headingDeg ?? 0,
          tripId: bus.tripId,
        };
      }

      // ETA fusion: prefer GPS / distance whenever we have a vehicle
      // position, not only when "provably riding". This fixes the bug where
      // the countdown keeps ticking down while the bus is dwelling at a
      // stop — the schedule says we should be closer by now, but distance
      // says otherwise. Honest answer: distance wins.
      const alightLoc =
        walkOut?.kind === "walk" ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null;
      if (alightLoc && fusedVehicle) {
        const distToAlight = distanceM(fusedVehicle, alightLoc);
        // Optimistic urban+intercity cruise speed (~40 km/h). Used as a
        // *floor* — the ETA can never drop below what's physically possible
        // given the remaining distance, even if the schedule disagrees.
        const FLOOR_SPEED_MPS = 11;
        const minPossibleEta = Math.round(distToAlight / FLOOR_SPEED_MPS);

        if (ridingWithBus && gpsSpeed > 2) {
          // Bus is moving with rider → blend live GPS speed with schedule.
          const gpsEta = Math.round(distToAlight / Math.max(3, gpsSpeed));
          fusedSecsToAlight = Math.max(
            minPossibleEta,
            Math.round(0.6 * gpsEta + 0.4 * secsToAlight),
          );
        } else if (vehicleLost) {
          // Feed gone, rider GPS is the only truth.
          const speed = gpsSpeed > 2 ? gpsSpeed : 6;
          fusedSecsToAlight = Math.max(
            minPossibleEta,
            Math.round(distToAlight / speed),
          );
        } else {
          // Stopped at a light / dwelling at a stop / traffic. Trust the
          // schedule as a soft hint but clamp by the distance floor so the
          // number stops decreasing once we're "already as close as we can
          // be" for the time elapsed.
          fusedSecsToAlight = Math.max(minPossibleEta, secsToAlight);
        }
        fusedSecsToAlight = Math.max(0, fusedSecsToAlight);
      }
    }

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
      fusedSecsToAlight,
      fusedVehicle,
      onBoardSuggested,
      missedSuggested,
      vehicleLost,
      feedStale,
    };
  }, [active, bus, fix, live, rt, started, walkIn, walkOut, walkingPhase, walkingSteps, feedStale]);


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
      // Persist the completed trip so it can power personalized suggestions.
      fireOnce("history", () => {
        void import("./suggestions.functions").then(({ recordTripHistory }) =>
          recordTripHistory({
            data: {
              deviceId,
              from: {
                lat: active!.from.lat,
                lng: active!.from.lng,
                label: active!.from.label,
              },
              to: {
                lat: active!.to.lat,
                lng: active!.to.lng,
                label: active!.to.label,
              },
              routeShort: bus.routeShort,
              source: "completed",
            },
          }).catch(() => {}),
        );
      });
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
