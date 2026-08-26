// Live journey orchestrator (web). Reads continuous GPS + the live realtime
// feed and derives a richer phase machine on top of the time-based one in
// trip.$id.tsx. Emits one-shot push alerts when phases transition.
//
// All of the reasoning — phase resolution, the vehicle-position ETA floor,
// GPS × feed fusion and which phase deserves an alert — lives in the shared,
// unit-tested `@aloya/core/journey-live`. This file is the React wiring:
// subscriptions, memoisation, persistence and the push side effects.

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
import {
  alertForPhase,
  fuseVehicleAndEta,
  resolveLivePhase,
  shouldAutoConfirmAlighting,
  shouldAutoConfirmBoarding,
  vehicleBasedSecsToBoard,
  type FusedVehicle,
  type LivePhase as CoreLivePhase,
} from "@aloya/core/journey-live";
import {
  alightAlertFor,
  computeAlightCountdown,
  sequenceForTrip,
  type AlightCountdown,
} from "@aloya/core/alight-countdown";

const SEQUENCES = ROUTE_SEQUENCES as Record<string, string[]>;

/** Calm placeholder used before tracking starts. */
const IDLE_COUNTDOWN: AlightCountdown = {
  stage: "cruising",
  stopsRemaining: null,
  metersToAlight: null,
  atStop: false,
  currentStop: null,
  nextStop: null,
  upcoming: [],
  alightStop: null,
  hasSequence: false,
};

import type { JourneyPhase } from "./journey-phase";
export type { JourneyPhase } from "./journey-phase";

/** @deprecated use JourneyPhase from "@/lib/journey-phase" */
export type LivePhase = Extract<JourneyPhase, CoreLivePhase>;

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
  fusedVehicle: FusedVehicle | null;
  // Diagnostics
  onBoardSuggested: boolean; // GPS suggests user is moving with bus
  missedSuggested: boolean; // bus departed without user confirmation
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

  /** Stop-aware alighting countdown: which stop the bus is at, how many
   *  are left, and whether it is genuinely time to press the button. */
  alight: AlightCountdown;
};

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
  useEffect(() => {
    prefetchShapes();
  }, []);
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
    () => (walkOut?.kind === "walk" ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null),
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
      alight: IDLE_COUNTDOWN,
    };

    if (!active || !bus || !started) return baseInactive;

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
      walkingPhase === "to-stop" ? walkIn : walkingPhase === "to-dest" ? walkOut : null;
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

    const vehicle = rt?.vehicles.find((v) => v.tripId === bus.tripId) ?? null;

    // Vehicle-position-based ETA floor. The GTFS-RT stop_time_update for the
    // board stop is often wildly optimistic when delay propagation hasn't
    // caught up (feed says "2 min" while the bus is still 6 stops upstream).
    if (vehicle && !live?.onBoardConfirmedAt && !live?.alightedAt) {
      const vehEta = vehicleBasedSecsToBoard({
        vehicle: { lat: vehicle.lat, lng: vehicle.lng },
        routeId: bus.routeId,
        boardStopId: bus.board.stopId,
        sequences: SEQUENCES,
        getStop: (id) => {
          const s = getStop(id);
          return s ? { lat: s.lat, lng: s.lng } : null;
        },
      });
      if (vehEta != null && vehEta > secsToBoard + 60) secsToBoard = vehEta;
    }

    // The bus leg only stores stopId/name, so the walk legs supply the
    // coordinates for the board stop and the final destination.
    const boardLoc = walkIn?.kind === "walk" ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null;
    const destLoc = walkOut?.kind === "walk" ? { lat: walkOut.to.lat, lng: walkOut.to.lng } : null;
    const fusionAlightLoc =
      walkOut?.kind === "walk" ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null;

    // ---- Stop-aware alighting countdown ---------------------------------
    // Counting stops, not seconds. While riding, the best available bus
    // position is the feed vehicle; when the feed drops it, the rider's own
    // phone IS the bus, so it stands in.
    const ridingNow = !!live?.onBoardConfirmedAt && !live?.alightedAt;
    const busPosition = vehicle
      ? { lat: vehicle.lat, lng: vehicle.lng }
      : ridingNow && fix
        ? { lat: fix.lat, lng: fix.lng }
        : null;
    const alight = ridingNow
      ? computeAlightCountdown({
          sequence: sequenceForTrip(
            SEQUENCES,
            bus.routeId,
            bus.board.stopId,
            bus.alight.stopId,
          ),
          alightStopId: bus.alight.stopId,
          boardStopId: bus.board.stopId,
          getStop: (id) => {
            const st = getStop(id);
            return st ? { name: st.name, lat: st.lat, lng: st.lng } : null;
          },
          position: busPosition,
          speedMps: vehicle ? null : (fix?.speedMps ?? null),
          alightLoc: fusionAlightLoc,
        })
      : IDLE_COUNTDOWN;

    const { phase, onBoardSuggested, missedSuggested } = resolveLivePhase({
      nowUnix: now,
      fix,
      vehicle,
      boardLoc,
      destLoc,
      secsToBoard,
      secsToAlight,
      walkingEtaSec,
      boardUnix,
      onBoardConfirmedAt: live?.onBoardConfirmedAt ?? null,
      missedAt: live?.missedAt ?? null,
      alightedAt: live?.alightedAt ?? null,
      stopsRemaining: alight.hasSequence ? alight.stopsRemaining : null,
    });

    // GPS × feed fusion, on-board only: once the rider confirms, the phone IS
    // the bus, so it drives both the marker and the time-to-alight.
    const fusion = onBoard
      ? fuseVehicleAndEta({
          tripId: bus.tripId,
          fix,
          vehicle,
          alightLoc: fusionAlightLoc,
          secsToAlight,
          driveEtaSec: drive.etaSec,
        })
      : { fusedVehicle: null, vehicleLost: false, fusedSecsToAlight: secsToAlight };

    // Feed is healthy but no vehicle for this tripId yet. Very common before
    // departure or at night. Surface a banner instead of a silently empty map.
    const vehicleNotTracked =
      !feedStale && !!rt && !vehicle && !live?.onBoardConfirmedAt && !live?.alightedAt;

    // Wrong-stop reroute hint (Google-Maps-style), pre-board only.
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
      fusedSecsToAlight: fusion.fusedSecsToAlight,
      fusedVehicle: fusion.fusedVehicle,
      onBoardSuggested,
      missedSuggested,
      vehicleLost: fusion.vehicleLost,
      feedStale,
      tripGhost: !!(bus?.tripId && rt?.ghostTripIds?.includes(bus.tripId)),
      vehicleNotTracked,

      rerouteHint,
      alight,
    };
    // `tick` is a deliberate heartbeat that forces countdown recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    bus,
    fix,
    live,
    rt,
    started,
    walkIn,
    walkOut,
    walkingPhase,
    walkingSteps,
    feedStale,
    drive.etaSec,
    onBoard,
    tick,
  ]);

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
    const boardLoc = walkIn?.kind === "walk" ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null;
    const next = shouldAutoConfirmBoarding({
      fix,
      boardLoc,
      ridingSinceMs: ridingStartedAtRef.current,
      nowMs: Date.now(),
    });
    ridingStartedAtRef.current = next.ridingSinceMs;
    if (next.confirm) patchActiveTripLive({ onBoardConfirmedAt: Date.now() });
  }, [result.active, bus, fix, live, walkIn]);

  // ---- Push alerting on phase transition -----------------------------------
  const sentRef = useRef<Set<string>>(new Set());
  const sendAlert = useServerFn(sendTripAlert);

  useEffect(() => {
    if (!result.active || !bus || !active) return;
    const alert = alertForPhase({
      phase: result.phase,
      onBoardSuggested: result.onBoardSuggested,
      secsToBoard: result.secsToBoard,
      boardName: bus.board.name,
      alightName: bus.alight.name,
    });
    if (!alert || sentRef.current.has(alert.key)) return;
    sentRef.current.add(alert.key);

    const deviceId = getDeviceId();
    const url = `/trip/${active.option.id}`;

    void sendAlert({
      data: {
        deviceId,
        kind: alert.kind,
        routeShort: bus.routeShort,
        ...(alert.stopName ? { stopName: alert.stopName } : {}),
        ...(alert.minutes != null ? { minutes: alert.minutes } : {}),
        url,
      },
    }).catch(() => {});

    // Persist the completed trip so it can power personalized suggestions.
    if (alert.recordsHistory) {
      void (async () => {
        const [{ recordTripHistory }, { getDeviceToken, getAccessToken }] = await Promise.all([
          import("./suggestions.functions"),
          import("./pwa"),
        ]);
        const [token, accessToken] = await Promise.all([getDeviceToken(), getAccessToken()]);
        if (!token) return;
        await recordTripHistory({
          data: {
            deviceId,
            deviceToken: token,
            accessToken,
            from: { lat: active.from.lat, lng: active.from.lng, label: active.from.label },
            to: { lat: active.to.lat, lng: active.to.lng, label: active.to.label },
            routeShort: bus.routeShort,
            source: "completed",
          },
        }).catch(() => {});
      })();
    }
  }, [
    result.phase,
    result.onBoardSuggested,
    result.secsToBoard,
    result.active,
    active,
    bus,
    sendAlert,
  ]);

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
