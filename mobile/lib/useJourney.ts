// Native live-journey orchestrator. Twin of `src/lib/useJourney.ts` — both
// now share one phase machine, one fusion model and one alert policy from
// `@aloya/core/journey-live`, so copy, escalation timing and the
// boarding/missed/alight heuristics can never drift between the platforms.
//
// Native specifics handled here:
//   - GPS comes from `useFusedFix` (expo-location + GeoFuser)
//   - realtime comes from the mobile `useRealtime`
//   - trip persistence is AsyncStorage via `mobile/lib/trip-store`
//   - alerts are LOCAL via `sendLocalTripAlert` (expo-notifications)
//
// Still web-only (kept explicit so the gap is visible):
//   - Google Routes drive-ETA fusion (needs `/api/public/drive-eta`)
//   - wrong-stop-reroute hint (needs route_stops.json bundled on device)
//   - trip-history recording (needs deviceToken + access token plumbing)

import { useEffect, useMemo, useRef, useState } from "react";
import { distanceM, projectOnSteps, WALK_M_PER_S, type WalkStep } from "@aloya/core/geo";
import { getShapeForTripSync, prefetchShapes, type LatLng } from "@aloya/core/shapes";
import type { JourneyPhase } from "@aloya/core/journey-phase";
import {
  alertForPhase,
  fuseVehicleAndEta,
  resolveLivePhase,
  shouldAutoConfirmAlighting,
  shouldAutoConfirmBoarding,
  type FusedVehicle,
  type LivePhase as CoreLivePhase,
} from "@aloya/core/journey-live";
import {
  alightAlertFor,
  computeAlightCountdown,
  sequenceForTrip,
  type AlightCountdown,
} from "@aloya/core/alight-countdown";
import { useRealtime, useRouteSequences } from "./hooks";
import { getStop } from "./gtfs";
import { useFusedFix, type FusedFix } from "./useFusedFix";
import { patchActiveTripLive, type ActiveTrip } from "./trip-store";
import { sendLocalTripAlert } from "./tripAlerts";

export type { JourneyPhase } from "@aloya/core/journey-phase";

export type LivePhase = Extract<JourneyPhase, CoreLivePhase>;

export type LiveFix = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: number;
};

export type LiveJourney = {
  active: boolean;
  fix: LiveFix | null;
  phase: LivePhase;
  currentStepIndex: number;
  metersToStepEnd: number;
  metersToDestination: number;
  walkingEtaSec: number;
  secsToBoard: number;
  secsToAlight: number;
  fusedSecsToAlight: number;
  fusedVehicle: FusedVehicle | null;
  onBoardSuggested: boolean;
  missedSuggested: boolean;
  vehicleLost: boolean;
  feedStale: boolean;
  tripGhost: boolean;
  vehicleNotTracked: boolean;
  /** Stop-aware alighting countdown (see @aloya/core/alight-countdown). */
  alight: AlightCountdown;
};

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

// ---- Re-derive ETAs every 5s so countdowns don't freeze between GPS fixes.
function useTick(ms: number): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(h);
  }, [ms]);
  return t;
}

export function useJourney(opts: {
  active: ActiveTrip | null;
  walkingSteps: WalkStep[] | null;
  walkingPhase: "to-stop" | "to-dest" | null;
}): LiveJourney {
  const { active, walkingSteps, walkingPhase } = opts;
  const live = active?.live;
  const started = !!live?.startedAt;

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

  const fix: LiveFix | null = useMemo(() => (fused ? fusedToLive(fused) : null), [fused]);

  const rtQuery = useRealtime();
  const rt = rtQuery.data;
  const sequences = useRouteSequences().data;
  const feedStale = !!rtQuery.isStale;

  const tick = useTick(5_000); // keeps countdowns moving between fixes

  const bus = useMemo(() => {
    if (!active) return null;
    const b = active.option.legs.find((l) => l.kind === "bus");
    return b && b.kind === "bus" ? b : null;
  }, [active]);

  const walkIn = active?.option.legs[0];
  const walkOut = active?.option.legs[active.option.legs.length - 1];

  const result = useMemo<LiveJourney>(() => {
    const inactive: LiveJourney = {
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
      alight: IDLE_COUNTDOWN,
    };
    if (!active || !bus || !started) return inactive;

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

    const boardLoc = walkIn?.kind === "walk" ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null;
    const destLoc = walkOut?.kind === "walk" ? { lat: walkOut.to.lat, lng: walkOut.to.lng } : null;
    const fusionAlightLoc =
      walkOut?.kind === "walk" ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null;

    // Stop-aware alighting countdown. While riding, the feed vehicle is the
    // bus; when the feed drops it, the rider's phone stands in for it.
    const ridingNow = !!live?.onBoardConfirmedAt && !live?.alightedAt;
    const busPosition = vehicle
      ? { lat: vehicle.lat, lng: vehicle.lng }
      : ridingNow && fix
        ? { lat: fix.lat, lng: fix.lng }
        : null;
    const alight = ridingNow
      ? computeAlightCountdown({
          sequence: sequenceForTrip(
            sequences ?? {},
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

    const onBoard = !!live?.onBoardConfirmedAt && !live?.alightedAt;
    const fusion = onBoard
      ? fuseVehicleAndEta({
          tripId: bus.tripId,
          fix,
          vehicle,
          alightLoc: fusionAlightLoc,
          secsToAlight,
          // TODO: blend the Routes drive-ETA once /api/public/drive-eta is
          // wired on device; web already passes it here.
          driveEtaSec: null,
        })
      : { fusedVehicle: null, vehicleLost: false, fusedSecsToAlight: secsToAlight };

    const vehicleNotTracked =
      !feedStale && !!rt && !vehicle && !live?.onBoardConfirmedAt && !live?.alightedAt;

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
      tripGhost: !!(bus?.tripId && rtQuery.ghostTripIds?.has(bus.tripId)),
      vehicleNotTracked,
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
    rtQuery.ghostTripIds,
    started,
    walkIn,
    walkOut,
    walkingPhase,
    walkingSteps,
    feedStale,
    sequences,
    tick,
  ]);

  // ---- GPS-based auto-confirm boarding -------------------------------------
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

  // ---- GPS-based auto-detection of alighting -------------------------------
  // Riders forget to press "I'm off". Once they have visibly separated from
  // the bus at walking pace we close the ride ourselves, which is what flips
  // guidance over to walking from wherever they actually stand.
  const offSinceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!result.active || !bus) return;
    if (!live?.onBoardConfirmedAt || live?.alightedAt) {
      offSinceRef.current = null;
      return;
    }
    const vehicle = rt?.vehicles.find((v) => v.tripId === bus.tripId) ?? null;
    const alightLoc =
      walkOut?.kind === "walk" ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null;
    const next = shouldAutoConfirmAlighting({
      fix,
      vehicle: vehicle ? { lat: vehicle.lat, lng: vehicle.lng } : null,
      alightLoc,
      nearAlight:
        result.alight.stage === "press-now" ||
        result.alight.stage === "alighting" ||
        result.alight.stage === "passed",
      offSinceMs: offSinceRef.current,
      nowMs: Date.now(),
    });
    offSinceRef.current = next.offSinceMs;
    if (next.confirm) patchActiveTripLive({ alightedAt: Date.now() });
  }, [result.active, result.alight.stage, bus, fix, live, rt, walkOut]);

  // ---- One-shot alerts on phase transition ---------------------------------
  const sentRef = useRef<Set<string>>(new Set());

  // Stop-aware alight cues own the "press the button" buzz whenever the stop
  // sequence is known — the coarse phase flips a full stop too early.
  useEffect(() => {
    if (!result.active || !bus || !active) return;
    if (!result.alight.hasSequence) return;
    const cue = alightAlertFor(result.alight.stage, bus.alight.name);
    if (!cue || sentRef.current.has(cue.key)) return;
    sentRef.current.add(cue.key);
    void sendLocalTripAlert({
      kind: cue.kind,
      routeShort: bus.routeShort,
      stopName: cue.stopName,
      ...(result.alight.stopsRemaining != null && result.alight.stopsRemaining >= 0
        ? { stops: result.alight.stopsRemaining }
        : {}),
      url: `/trip/${active.option.id}`,
    });
  }, [result.active, result.alight, active, bus]);

  useEffect(() => {
    if (!result.active || !bus || !active) return;
    // When stop counting is live it owns the press-stop buzz.
    if (result.phase === "alight-soon" && result.alight.hasSequence) return;
    const alert = alertForPhase({
      phase: result.phase,
      onBoardSuggested: result.onBoardSuggested,
      secsToBoard: result.secsToBoard,
      boardName: bus.board.name,
      alightName: bus.alight.name,
    });
    if (!alert || sentRef.current.has(alert.key)) return;
    sentRef.current.add(alert.key);

    void sendLocalTripAlert({
      kind: alert.kind,
      routeShort: bus.routeShort,
      ...(alert.stopName ? { stopName: alert.stopName } : {}),
      ...(alert.minutes != null ? { minutes: alert.minutes } : {}),
      url: `/trip/${active.option.id}`,
    });
  }, [result.phase, result.onBoardSuggested, result.secsToBoard, result.active, active, bus]);

  return result;
}

// ---- Action helpers --------------------------------------------------------

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

// ---- Internal --------------------------------------------------------------

function fusedToLive(f: FusedFix): LiveFix {
  return {
    lat: f.lat,
    lng: f.lng,
    accuracyM: f.uncertaintyM,
    speedMps: f.speedMps,
    headingDeg: f.bearingDeg,
    timestamp: f.timestamp,
  };
}
