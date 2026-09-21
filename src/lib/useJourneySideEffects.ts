// Side effects of live journey tracking, lifted out of `useJourney` so that
// hook stays a pure derivation of state.
//
// Three of them, all of which write outward rather than returning anything:
//   1. auto-confirm boarding  — sustained bus-speed motion away from the stop
//   2. auto-confirm alighting — sustained separation from the bus on foot
//   3. push alerting          — phase transitions and stop-aware alight cues
//
// Cue precedence matters: when the stop sequence is known, the countdown owns
// the "press the button" buzz, because the coarse `alight-soon` phase flips a
// full stop earlier than a rider should reach for the bell.

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  alertForPhase,
  shouldAutoConfirmAlighting,
  shouldAutoConfirmBoarding,
} from "@aloya/core/journey-live";
import { alightAlertFor } from "@aloya/core/alight-countdown";
import {
  destBailForWait,
  EMPTY_WAIT_FLIP_HOLD,
  tickWaitFlip,
  waitFlipPhase,
  type WaitFlipHold,
} from "@aloya/core/dest-bail";
import { patchActiveTripLive, type ActiveTrip } from "./trip-store";
import { getDeviceId } from "./pwa";
import { sendTripAlert } from "./push.functions";
import type { LatLng } from "@aloya/core/shapes";
import type { LiveJourney } from "./useJourney";

type Leg = ActiveTrip["option"]["legs"][number];
type BusLeg = Extract<Leg, { kind: "bus" }>;
type WalkLeg = Extract<Leg, { kind: "walk" }>;
type VehicleLite = { tripId: string; lat: number; lng: number };

export type JourneySideEffectInput = {
  result: LiveJourney;
  active: ActiveTrip | null;
  bus: BusLeg | null | undefined;
  walkIn: Leg | null | undefined;
  walkOut: Leg | null | undefined;
  fix: (LatLng & { speedMps?: number | null }) | null;
  live: ActiveTrip["live"] | null | undefined;
  vehicles: VehicleLite[] | null | undefined;
};

const isWalk = (leg: Leg | null | undefined): leg is WalkLeg => leg?.kind === "walk";

export function useJourneySideEffects(input: JourneySideEffectInput) {
  const { result, active, bus, walkIn, walkOut, fix, live, vehicles } = input;

  // ---- GPS-based auto-confirm boarding -------------------------------------
  // If the rider's GPS shows sustained bus-speed motion AND they've left the
  // board stop, mark them on-board automatically. This is the safety net for
  // when the GTFS-RT feed has no vehicle for the tripId and the prompt
  // would otherwise never appear.
  const ridingStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!result.active || !bus) return;
    if (live?.onBoardConfirmedAt || live?.missedAt || live?.alightedAt) {
      ridingStartedAtRef.current = null;
      return;
    }
    const boardLoc = isWalk(walkIn) ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null;
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
    const vehicle = vehicles?.find((v) => v.tripId === bus.tripId) ?? null;
    const alightLoc = isWalk(walkOut) ? { lat: walkOut.from.lat, lng: walkOut.from.lng } : null;
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
  }, [result.active, result.alight.stage, bus, fix, live, vehicles, walkOut]);

  // ---- Push alerting -------------------------------------------------------
  const sentRef = useRef<Set<string>>(new Set());
  const sendAlert = useServerFn(sendTripAlert);

  // Stop-aware alight cues.
  useEffect(() => {
    if (!result.active || !bus || !active) return;
    if (!result.alight.hasSequence) return;
    const cue = alightAlertFor(result.alight.stage, bus.alight.name);
    if (!cue || sentRef.current.has(cue.key)) return;
    sentRef.current.add(cue.key);

    // Haptic vibration feedback for alight cues
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        if (cue.kind === "press-stop") {
          navigator.vibrate([180, 80, 180]); // Double pulse: ring the bell
        } else if (cue.kind === "alight-ready") {
          navigator.vibrate([100, 100, 100]); // Gentle pulse: stop coming up
        }
      } catch {}
    }

    void sendAlert({
      data: {
        deviceId: getDeviceId(),
        kind: cue.kind,
        routeShort: bus.routeShort,
        stopName: cue.stopName,
        ...(result.alight.stopsRemaining != null && result.alight.stopsRemaining >= 0
          ? { stops: result.alight.stopsRemaining }
          : {}),
        url: `/trip/${active.option.id}`,
      },
    }).catch(() => {});
  }, [result.active, result.alight, active, bus, sendAlert]);

  // Phase transitions.
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

    // Haptic vibration feedback for phase transition alerts
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        if (alert.kind === "press-stop") {
          navigator.vibrate([180, 80, 180]);
        } else if (alert.kind === "hurry-urgent") {
          navigator.vibrate([200, 100, 200, 100, 200]);
        } else if (alert.kind === "hurry-soft" || alert.kind === "at-stop") {
          navigator.vibrate([100, 100, 100]);
        } else if (alert.kind === "confirm-onboard") {
          navigator.vibrate([150]);
        }
      } catch {}
    }

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
    result.alight.hasSequence,
    result.onBoardSuggested,
    result.secsToBoard,
    result.active,
    active,
    bus,
    sendAlert,
  ]);

  // One push if walk-vs-wait holds 60s then flips. HUD dest-bail stays the live line.
  const waitFlipRef = useRef<WaitFlipHold>(EMPTY_WAIT_FLIP_HOLD);
  useEffect(() => {
    if (!result.active || !bus || !active) {
      waitFlipRef.current = EMPTY_WAIT_FLIP_HOLD;
      return;
    }
    const from = fix ?? (isWalk(walkIn) ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null);
    const action = destBailForWait({
      dark: result.tripGhost,
      phase: waitFlipPhase(result.phase),
      waitMin: result.secsToBoard / 60,
      from,
      to: { lat: active.to.lat, lng: active.to.lng },
      destLabel: active.to.label,
      routeShort: bus.routeShort,
    });
    const { hold, flip } = tickWaitFlip(waitFlipRef.current, action, Math.floor(Date.now() / 1000));
    waitFlipRef.current = hold;
    if (!flip) return;
    void sendAlert({
      data: {
        deviceId: getDeviceId(),
        kind: "wait-flip",
        routeShort: flip.to.routeShort,
        minutes: "waitMin" in flip.to ? flip.to.waitMin : 0,
        walkMin: "walkMin" in flip.to ? flip.to.walkMin : 0,
        flipTo: flip.to.kind,
        ...("destLabel" in flip.to ? { stopName: flip.to.destLabel } : {}),
        url: `/trip/${active.option.id}`,
      },
    }).catch(() => {});
  }, [
    result.active,
    result.tripGhost,
    result.phase,
    result.secsToBoard,
    active,
    bus,
    fix,
    walkIn,
    sendAlert,
  ]);
}
