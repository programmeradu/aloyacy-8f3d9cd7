// Native live-journey orchestrator. Mirror of `src/lib/useJourney.ts` —
// same phase machine, same GPS×feed fusion, same one-shot alert fanout,
// adapted for React Native:
//
//   - GPS comes from `useFusedFix` (expo-location + GeoFuser)
//   - realtime comes from the existing mobile `useRealtime`
//   - trip persistence is AsyncStorage via `mobile/lib/trip-store`
//   - alerts are LOCAL via `sendLocalTripAlert` (expo-notifications)
//
// Deferred to later 12 slices (kept as TODO to make the gaps explicit):
//   - Google Routes drive-ETA fusion (needs `/api/public/drive-eta`)
//   - wrong-stop-reroute hint (needs route_stops.json bundled on device)
//   - trip-history recording (needs deviceToken + access token plumbing)
//
// The phase machine itself is identical to web so copy, escalation
// timing, and the boarding/missed/alight heuristics behave the same.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  distanceM,
  projectOnSteps,
  WALK_M_PER_S,
  type WalkStep,
} from "@aloya/core/geo";
import { getShapeForTripSync, prefetchShapes, type LatLng } from "@aloya/core/shapes";
import type { JourneyPhase } from "@aloya/core/journey-phase";
import { useRealtime } from "./hooks";
import { useFusedFix, type FusedFix } from "./useFusedFix";
import {
  patchActiveTripLive,
  type ActiveTrip,
} from "./trip-store";
import { sendLocalTripAlert } from "./tripAlerts";

export type { JourneyPhase } from "@aloya/core/journey-phase";

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
  fusedVehicle: {
    lat: number;
    lng: number;
    bearing: number;
    tripId: string;
  } | null;
  onBoardSuggested: boolean;
  missedSuggested: boolean;
  vehicleLost: boolean;
  feedStale: boolean;
  tripGhost: boolean;
  vehicleNotTracked: boolean;
};

// ---- Heuristic constants (kept in lockstep with web) -----------------------
const ARRIVAL_RADIUS_M = 30;
const BUS_MATCH_RADIUS_M = 60;
const RIDING_SPEED_MPS = 5; // ~18 km/h
const HURRY_SOFT_GAP_S = 180;
const HURRY_URGENT_GAP_S = 0;
const SUSTAINED_RIDING_MS = 12_000;
const RIDING_DISPLACEMENT_M = 80;

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

  const fix: LiveFix | null = useMemo(() => {
    if (!fused) return null;
    return fusedToLive(fused);
  }, [fused]);

  const rtQuery = useRealtime();
  const rt = rtQuery.data;
  const feedStale = !!rtQuery.isStale;

  useTick(5_000); // keep countdowns moving between fixes

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
      phase: "idle" as LivePhase,
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

    const vehicle = rt?.vehicles.find((v) => v.tripId === bus.tripId);
    const distToBus = fix && vehicle ? distanceM(fix, vehicle) : Infinity;

    // ---- Phase resolution ---------------------------------------------------
    let phase: LivePhase = "walking-to-stop";

    if (live?.alightedAt) {
      const destLoc =
        walkOut?.kind === "walk"
          ? { lat: walkOut.to.lat, lng: walkOut.to.lng }
          : null;
      const distToDest = fix && destLoc ? distanceM(fix, destLoc) : Infinity;
      phase = fix && destLoc && distToDest < ARRIVAL_RADIUS_M
        ? "arrived"
        : "walking-to-dest";
    } else if (live?.onBoardConfirmedAt) {
      phase = secsToAlight <= 60 ? "alight-soon" : "on-bus";
    } else if (live?.missedAt) {
      phase = "missed-bus";
    } else {
      const boardLoc =
        walkIn?.kind === "walk"
          ? { lat: walkIn.to.lat, lng: walkIn.to.lng }
          : null;
      const distToBoardStop =
        fix && boardLoc ? distanceM(fix, boardLoc) : Infinity;
      const atStop =
        !!fix && !!boardLoc && distToBoardStop < ARRIVAL_RADIUS_M;
      const gpsSpeed = fix?.speedMps ?? 0;
      const ridingByGps = gpsSpeed > RIDING_SPEED_MPS;
      const departedStop = distToBoardStop > RIDING_DISPLACEMENT_M;
      const inBoardingWindow = secsToBoard <= 120 && secsToBoard >= -180;

      if (atStop) {
        const vehicleAtStop = !!vehicle && distToBus < BUS_MATCH_RADIUS_M;
        phase =
          vehicleAtStop || ridingByGps || inBoardingWindow
            ? "boarding"
            : "at-stop";
      } else if (ridingByGps && departedStop && inBoardingWindow) {
        phase = "boarding";
      } else {
        phase = "walking-to-stop";
        if (secsToBoard > 0) {
          const gap = secsToBoard - walkingEtaSec;
          if (gap <= HURRY_URGENT_GAP_S) phase = "hurry-urgent";
          else if (gap <= HURRY_SOFT_GAP_S) phase = "hurry-soft";
        }
      }

      // Missed-bus detection
      if (vehicle && bus && !ridingByGps && boardLoc) {
        const busFromStop = distanceM(vehicle, boardLoc);
        const riderFarFromBus = !fix || distanceM(fix, vehicle) > 250;
        const riderStillNearStop =
          !!fix && distToBoardStop < 60;
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

    const onBoardSuggested =
      !!fix &&
      (fix.speedMps ?? 0) > RIDING_SPEED_MPS &&
      !live?.onBoardConfirmedAt;
    const missedSuggested = phase === "missed-bus";

    // ---- GPS × feed fusion (on-board) --------------------------------------
    let fusedVehicle: LiveJourney["fusedVehicle"] = null;
    let fusedSecsToAlight = secsToAlight;
    let vehicleLost = false;
    const onBoard = !!live?.onBoardConfirmedAt && !live?.alightedAt;
    if (onBoard && bus) {
      const gpsSpeed = fix?.speedMps ?? 0;
      const distToVehicle =
        fix && vehicle ? distanceM(fix, vehicle) : Infinity;
      const ridingWithBus =
        !!fix &&
        !!vehicle &&
        gpsSpeed > RIDING_SPEED_MPS &&
        distToVehicle < 250;

      if (vehicle && ridingWithBus && fix) {
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
        fusedVehicle = {
          lat: vehicle.lat,
          lng: vehicle.lng,
          bearing: vehicle.bearing ?? 0,
          tripId: bus.tripId,
        };
      } else if (fix) {
        vehicleLost = true;
        fusedVehicle = {
          lat: fix.lat,
          lng: fix.lng,
          bearing: fix.headingDeg ?? 0,
          tripId: bus.tripId,
        };
      }

      const fusionAlightLoc =
        walkOut?.kind === "walk"
          ? { lat: walkOut.from.lat, lng: walkOut.from.lng }
          : null;
      if (fusionAlightLoc && fusedVehicle) {
        const distToAlight = distanceM(fusedVehicle, fusionAlightLoc);
        const FLOOR_SPEED_MPS = 11;
        const minPossibleEta = Math.round(distToAlight / FLOOR_SPEED_MPS);

        // TODO(12b): blend Google Routes drive-ETA when /api/public/drive-eta lands.
        if (ridingWithBus && gpsSpeed > 2) {
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

    const vehicleNotTracked =
      !feedStale &&
      !!rt &&
      !vehicle &&
      !live?.onBoardConfirmedAt &&
      !live?.alightedAt;

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
      tripGhost: !!(bus?.tripId && rtQuery.ghostTripIds?.has(bus.tripId)),
      vehicleNotTracked,
    };
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
  ]);

  // ---- GPS-based auto-confirm boarding -------------------------------------
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
      walkIn?.kind === "walk"
        ? { lat: walkIn.to.lat, lng: walkIn.to.lng }
        : null;
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

  // ---- One-shot alerts on phase transition ---------------------------------
  const sentRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!result.active || !bus) return;
    const url = `/trip/${active!.option.id}`;
    const fireOnce = (key: string, fn: () => void) => {
      if (sentRef.current.has(key)) return;
      sentRef.current.add(key);
      fn();
    };

    if (result.phase === "hurry-soft") {
      fireOnce("hurry-soft", () =>
        void sendLocalTripAlert({
          kind: "hurry-soft",
          routeShort: bus.routeShort,
          stopName: bus.board.name,
          minutes: Math.max(0, Math.round(result.secsToBoard / 60)),
          url,
        }),
      );
    } else if (result.phase === "hurry-urgent") {
      fireOnce("hurry-urgent", () =>
        void sendLocalTripAlert({
          kind: "hurry-urgent",
          routeShort: bus.routeShort,
          stopName: bus.board.name,
          minutes: Math.max(0, Math.round(result.secsToBoard / 60)),
          url,
        }),
      );
    } else if (result.phase === "at-stop") {
      fireOnce("at-stop", () =>
        void sendLocalTripAlert({
          kind: "at-stop",
          routeShort: bus.routeShort,
          stopName: bus.board.name,
          minutes: Math.max(0, Math.round(result.secsToBoard / 60)),
          url,
        }),
      );
    } else if (result.phase === "boarding" && result.onBoardSuggested) {
      fireOnce("confirm-onboard", () =>
        void sendLocalTripAlert({
          kind: "confirm-onboard",
          routeShort: bus.routeShort,
          url,
        }),
      );
    } else if (result.phase === "missed-bus") {
      fireOnce("missed-bus", () =>
        void sendLocalTripAlert({
          kind: "missed-bus",
          routeShort: bus.routeShort,
          stopName: bus.board.name,
          url,
        }),
      );
    } else if (result.phase === "alight-soon") {
      fireOnce("press-stop", () =>
        void sendLocalTripAlert({
          kind: "press-stop",
          routeShort: bus.routeShort,
          stopName: bus.alight.name,
          url,
        }),
      );
    } else if (result.phase === "arrived") {
      fireOnce("arrived", () =>
        void sendLocalTripAlert({ kind: "arrived", url }),
      );
    }
  }, [
    result.phase,
    result.onBoardSuggested,
    result.secsToBoard,
    result.active,
    active,
    bus,
  ]);

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
