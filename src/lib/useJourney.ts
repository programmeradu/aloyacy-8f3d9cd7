// Live journey orchestrator. Reads continuous GPS + live realtime feed
// and derives a richer phase machine on top of the time-based one in
// trip.$id.tsx. Emits one-shot push alerts when phases transition.

import { useEffect, useMemo, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRealtime } from "./useRealtime";
import { useFusedFix } from "./useFusedFix";
import type { LiveFix } from "./useGeoWatch";
import { useDriveEta } from "./useDriveEta";
import { distanceM, projectOnSteps, WALK_M_PER_S, type WalkStep } from "./geo";
import { patchActiveTripLive, type ActiveTrip } from "./trip-store";
import { getDeviceId } from "./pwa";
import { sendTripAlert } from "./push.functions";
import { detectWrongStop, type RerouteHint } from "./wrong-stop-reroute";
import { getStop } from "./gtfs";
import { getShapeForTripSync, prefetchShapes, type LatLng } from "./shapes";
import ROUTE_SEQUENCES from "@/data/route_sequences.json";
import { useTick } from "@/hooks/use-tick";


const SEQUENCES = ROUTE_SEQUENCES as Record<string, string[]>;

// Rough urban-bus heuristics for the vehicle-position-based ETA floor.
// Used only when the GTFS-RT feed's stop_time_update for the board stop
// disagrees with the bus's actual location (very common at night and when
// delay propagation hasn't caught up).
const AVG_INTER_STOP_S = 75;
const AVG_BUS_MPS = 7; // ~25 km/h average urban with stops

function vehicleBasedSecsToBoard(
  vehicle: { lat: number; lng: number },
  routeId: string,
  boardStopId: string,
): number | null {
  // Find every directional sequence for this route that contains the board.
  let best: { stopsLeft: number; metersToNearest: number } | null = null;
  for (const key of Object.keys(SEQUENCES)) {
    if (!key.startsWith(routeId + "|")) continue;
    const seq = SEQUENCES[key];
    const boardIdx = seq.indexOf(boardStopId);
    if (boardIdx <= 0) continue;
    let nearestIdx = -1;
    let nearestD = Infinity;
    for (let i = 0; i <= boardIdx; i++) {
      const s = getStop(seq[i]);
      if (!s) continue;
      const d = distanceM(vehicle, { lat: s.lat, lng: s.lng });
      if (d < nearestD) {
        nearestD = d;
        nearestIdx = i;
      }
    }
    if (nearestIdx < 0 || nearestIdx > boardIdx) continue;
    const stopsLeft = boardIdx - nearestIdx;
    if (!best || stopsLeft < best.stopsLeft) {
      best = { stopsLeft, metersToNearest: nearestD };
    }
  }
  if (!best) return null;
  return Math.round(best.metersToNearest / AVG_BUS_MPS + best.stopsLeft * AVG_INTER_STOP_S);
}

// How long the rider's GPS must show sustained bus-speed motion before we
// auto-confirm boarding without an explicit tap. Guards against a single
// noisy speed sample (e.g. a phone tossed in a bag) triggering confirmation.
const SUSTAINED_RIDING_MS = 12_000;
// How far past the board stop the rider must travel before we treat their
// motion as "definitely on a bus, not jogging at the curb".
const RIDING_DISPLACEMENT_M = 80;

import type { JourneyPhase } from "./journey-phase";
export type { JourneyPhase } from "./journey-phase";

/** @deprecated use JourneyPhase from "@/lib/journey-phase" */
export type LivePhase = Extract<
  JourneyPhase,
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
  | "arrived"
>;

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
  /** True when this trip is flagged ghost on the snapshot (no fresh GPS ≥ 180s). */
  tripGhost: boolean;
  /** True when feed is healthy but no vehicle for this tripId yet (very common
   *  pre-departure and at night). Drives an honest "not yet on the live feed"
   *  banner instead of leaving the map silently empty. */
  vehicleNotTracked: boolean;

  /** Google-Maps-style wrong-stop hint: rider drifted to a different stop the
   *  same route serves, or to one it doesn't serve. */
  rerouteHint: RerouteHint;
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

  // Active polyline for snap-to-route: walking step polyline pre-board,
  // the GTFS trip shape once riding. Recomputed cheaply per render.
  useEffect(() => { prefetchShapes(); }, []);
  const bus0 = active?.option.legs.find((l) => l.kind === "bus");
  const onBoardEarly = !!live?.onBoardConfirmedAt && !live?.alightedAt;
  const activePath: LatLng[] | null = useMemo(() => {
    if (onBoardEarly && bus0 && bus0.kind === "bus") {
      return getShapeForTripSync(bus0.tripId, bus0.routeId);
    }
    if (walkingSteps && walkingSteps.length > 0) {
      const pts: LatLng[] = walkingSteps.map((s) => s.start);
      const last = walkingSteps[walkingSteps.length - 1];
      if (last.end) pts.push(last.end);
      return pts.length >= 2 ? pts : null;
    }
    return null;
  }, [onBoardEarly, bus0, walkingSteps]);

  const { fix: fused } = useFusedFix({ enabled: started, activePath });
  // Adapt to the existing LiveFix shape so downstream consumers are unchanged.
  const fix: LiveFix | null = useMemo(() => {
    if (!fused) return null;
    return {
      lat: fused.lat,
      lng: fused.lng,
      accuracyM: fused.uncertaintyM,
      speedMps: fused.speedMps,
      headingDeg: fused.bearingDeg,
      timestamp: fused.timestamp,
    };
  }, [fused]);
  const { data: rt, isStale: feedStale } = useRealtime();
  // Re-derive ETAs every 5s so countdowns stay fresh even when GPS/feed are
  // briefly idle. Without this, secsToAlight & secsToBoard freeze between
  // GPS fixes, causing the trip hero (which ticks on its own 5s clock) and
  // RidingCard (which uses live.fusedSecsToAlight) to drift by ~1 minute.
  const tick = useTick(5_000);



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
      tripGhost: false,
      vehicleNotTracked: false,

      rerouteHint: null,
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
    let secsToBoard = boardUnix - now;
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

    // Vehicle-position-based ETA floor. The GTFS-RT stop_time_update for the
    // board stop is often wildly optimistic when delay propagation hasn't
    // caught up (feed says "2 min" while the bus is still 6 stops upstream).
    // Cross-check with the actual vehicle position on the route sequence.
    if (vehicle && !live?.onBoardConfirmedAt && !live?.alightedAt) {
      const vehEta = vehicleBasedSecsToBoard(
        { lat: vehicle.lat, lng: vehicle.lng },
        bus.routeId,
        bus.board.stopId,
      );
      if (vehEta != null && vehEta > secsToBoard + 60) {
        secsToBoard = vehEta;
      }
    }

    // ---- Phase resolution ---------------------------------------------------
    let phase: LivePhase = "walking-to-stop";

    // After-the-bus leg
    if (live?.alightedAt) {
      const destLoc =
        walkOut?.kind === "walk"
          ? { lat: walkOut.to.lat, lng: walkOut.to.lng }
          : null;
      const distToDest = fix && destLoc ? distanceM(fix, destLoc) : Infinity;
      if (fix && destLoc && distToDest < ARRIVAL_RADIUS_M) phase = "arrived";
      else phase = "walking-to-dest";
    } else if (live?.onBoardConfirmedAt) {
      // Riding
      if (secsToAlight <= 60) phase = "alight-soon";
      else phase = "on-bus";
    } else if (live?.missedAt) {
      phase = "missed-bus";
    } else {
      // Pre-board phase. The bus leg only stores stopId/name, so use the
      // walk-in leg's `to` coordinate as the board-stop location.
      const boardLoc =
        walkIn?.kind === "walk"
          ? { lat: walkIn.to.lat, lng: walkIn.to.lng }
          : null;
      const distToBoardStop = fix && boardLoc ? distanceM(fix, boardLoc) : Infinity;
      const atStop = !!fix && !!boardLoc && distToBoardStop < ARRIVAL_RADIUS_M;

      // Rider's GPS-based riding signal — works even when the GTFS-RT feed
      // has no vehicle for this tripId (very common at night).
      const gpsSpeed = fix?.speedMps ?? 0;
      const ridingByGps = gpsSpeed > RIDING_SPEED_MPS;
      const departedStop = distToBoardStop > RIDING_DISPLACEMENT_M;
      // Within the boarding time window: from 2 min before scheduled board
      // until 3 min after (covers feed delay + dwell).
      const inBoardingWindow = secsToBoard <= 120 && secsToBoard >= -180;

      if (atStop) {
        // Show the "Are you on board?" prompt as soon as ANY of:
        //   - vehicle is at the stop (feed-driven, original behavior)
        //   - rider's GPS speed indicates they're moving with a bus
        //   - we're inside the boarding time window (be optimistic when the
        //     bus is due — better to ask too early than never)
        const vehicleAtStop = !!vehicle && distToBus < BUS_MATCH_RADIUS_M;
        if (vehicleAtStop || ridingByGps || inBoardingWindow) {
          phase = "boarding";
        } else {
          phase = "at-stop";
        }
      } else if (ridingByGps && departedStop && inBoardingWindow) {
        // Rider already left the stop AT bus speed — they boarded a moment
        // ago, we just never got the chance to ask. Surface the prompt.
        phase = "boarding";
      } else {
        phase = "walking-to-stop";
        // Hurry escalation while walking
        if (secsToBoard > 0) {
          const gap = secsToBoard - walkingEtaSec;
          if (gap <= HURRY_URGENT_GAP_S) phase = "hurry-urgent";
          else if (gap <= HURRY_SOFT_GAP_S) phase = "hurry-soft";
        }
      }

      // Missed-bus detection. Only fire when we're CONFIDENT the rider is
      // not on this bus: vehicle has cleared the stop, the rider isn't
      // moving at bus speed, and the rider's own GPS isn't near the vehicle.
      if (vehicle && bus && !ridingByGps && boardLoc) {
        const busFromStop = distanceM(vehicle, boardLoc);
        const riderFarFromBus = !fix || distanceM(fix, vehicle) > 250;
        const riderStillNearStop = !!fix && distToBoardStop < 60;
        if (
          busFromStop > 250 &&
          now > boardUnix + 60 &&
          riderFarFromBus &&
          riderStillNearStop
        ) {
          phase = "missed-bus";
        }
      }
    }

    // On-board auto-detection heuristic (suggest prompt, never auto-skip)
    const onBoardSuggested =
      !!fix &&
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

      // ETA fusion (in priority order):
      //   1. Google Routes API drive ETA — traffic-aware, road-following,
      //      authoritative. Decayed between refetches so the countdown
      //      still ticks down naturally.
      //   2. GPS speed + straight-line distance — when we're "provably
      //      riding with bus".
      //   3. Distance-floored schedule — when stopped/dwelling, so the
      //      number never drops below what's physically possible.
      const fusionAlightLoc =
        walkOut?.kind === "walk" ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null;
      if (fusionAlightLoc && fusedVehicle) {
        const distToAlight = distanceM(fusedVehicle, fusionAlightLoc);
        const FLOOR_SPEED_MPS = 11; // ~40 km/h optimistic urban+intercity
        const minPossibleEta = Math.round(distToAlight / FLOOR_SPEED_MPS);

        if (drive.etaSec != null) {
          // Google Routes is the source of truth when available.
          fusedSecsToAlight = Math.max(minPossibleEta, drive.etaSec);
        } else if (ridingWithBus && gpsSpeed > 2) {
          const gpsEta = Math.round(distToAlight / Math.max(3, gpsSpeed));
          fusedSecsToAlight = Math.max(
            minPossibleEta,
            Math.round(0.6 * gpsEta + 0.4 * secsToAlight),
          );
        } else if (vehicleLost) {
          const speed = gpsSpeed > 2 ? gpsSpeed : 6;
          fusedSecsToAlight = Math.max(
            minPossibleEta,
            Math.round(distToAlight / speed),
          );
        } else {
          fusedSecsToAlight = Math.max(minPossibleEta, secsToAlight);
        }
        fusedSecsToAlight = Math.max(0, fusedSecsToAlight);
      }
    }

    // ---- Vehicle-on-feed honesty ------------------------------------------
    // Feed is healthy but no vehicle for this tripId yet. Very common before
    // departure or at night. Surface a banner instead of silently empty map.
    const vehicleNotTracked =
      !feedStale &&
      !!rt &&
      !vehicle &&
      !live?.onBoardConfirmedAt &&
      !live?.alightedAt;

    // ---- Wrong-stop reroute hint (Google-Maps-style) ----------------------
    let rerouteHint: RerouteHint = null;
    if (
      (phase === "walking-to-stop" ||
        phase === "hurry-soft" ||
        phase === "hurry-urgent" ||
        phase === "at-stop") &&
      fix
    ) {
      rerouteHint = detectWrongStop({
        fixLat: fix.lat,
        fixLng: fix.lng,
        routeId: bus.routeId,
        plannedBoardStopId: bus.board.stopId,
        plannedAlightStopId: bus.alight.stopId,
      });
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
      tripGhost: !!(bus?.tripId && rt?.ghostTripIds?.includes(bus.tripId)),
      vehicleNotTracked,

      rerouteHint,
    };
  }, [active, bus, fix, live, rt, started, walkIn, walkOut, walkingPhase, walkingSteps, feedStale, drive.etaSec, onBoard, tick]);


  // ---- GPS-based auto-confirm boarding -------------------------------------
  // If the rider's GPS shows sustained bus-speed motion AND they've left the
  // board stop, mark them on-board automatically. This is the safety net for
  // when the GTFS-RT feed has no vehicle for the tripId and the prompt
  // would otherwise never appear (the exact failure mode reported at night).
  const ridingStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!result.active || !bus) return;
    if (live?.onBoardConfirmedAt || live?.missedAt || live?.alightedAt) {
      ridingStartedAtRef.current = null;
      return;
    }
    const gpsSpeed = fix?.speedMps ?? 0;
    if (gpsSpeed <= RIDING_SPEED_MPS) {
      ridingStartedAtRef.current = null;
      return;
    }
    const boardLoc =
      walkIn?.kind === "walk" ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null;
    const departed =
      !!fix && !!boardLoc && distanceM(fix, boardLoc) > RIDING_DISPLACEMENT_M;
    if (!departed) {
      ridingStartedAtRef.current = null;
      return;
    }
    if (ridingStartedAtRef.current == null) {
      ridingStartedAtRef.current = Date.now();
      return;
    }
    if (Date.now() - ridingStartedAtRef.current >= SUSTAINED_RIDING_MS) {
      patchActiveTripLive({ onBoardConfirmedAt: Date.now() });
      ridingStartedAtRef.current = null;
    }
  }, [result.active, bus, fix, live, walkIn]);





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
        void (async () => {
          const [{ recordTripHistory }, { getDeviceToken, getAccessToken }] = await Promise.all([
            import("./suggestions.functions"),
            import("./pwa"),
          ]);
          const [token, accessToken] = await Promise.all([
            getDeviceToken(),
            getAccessToken(),
          ]);
          if (!token) return;
          await recordTripHistory({
            data: {
              deviceId,
              deviceToken: token,
              accessToken,
              from: { lat: active!.from.lat, lng: active!.from.lng, label: active!.from.label },
              to: { lat: active!.to.lat, lng: active!.to.lng, label: active!.to.label },
              routeShort: bus.routeShort,
              source: "completed",
            },
          }).catch(() => {});
        })();
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
