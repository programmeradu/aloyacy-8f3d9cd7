// Side effects of a live journey, kept out of `useJourney` so that hook stays
// a pure derivation of state from GPS + feed.
//
// Two jobs, both about riders who never touch the screen:
//   1. Auto-confirm boarding and alighting from GPS, so guidance keeps moving
//      when nobody presses "I'm on" / "I'm off".
//   2. Fire one-shot local alerts. When the route's stop sequence is known the
//      stop-aware alight cues own the "press the button" buzz — the coarse
//      phase machine flips a full stop too early, which is exactly the bug
//      riders complained about.

import { useEffect, useRef } from "react";
import {
  alertForPhase,
  shouldAutoConfirmAlighting,
  shouldAutoConfirmBoarding,
} from "@aloya/core/journey-live";
import { alightAlertFor } from "@aloya/core/alight-countdown";
import { patchActiveTripLive, type ActiveTrip } from "./trip-store";
import { sendLocalTripAlert } from "./tripAlerts";
import { useWaitFlipAlert } from "./useWaitFlipAlert";
import type { LiveJourney, LiveFix } from "./useJourney";

type Leg = ActiveTrip["option"]["legs"][number];
type BusLeg = Extract<Leg, { kind: "bus" }>;

export function useJourneySideEffects({
  active,
  bus,
  fix,
  live,
  rt,
  result,
  walkIn,
  walkOut,
}: {
  active: ActiveTrip | null;
  bus: BusLeg | null | undefined;
  fix: LiveFix | null;
  live: ActiveTrip["live"] | null | undefined;
  rt: { vehicles: { tripId: string; lat: number; lng: number }[] } | undefined;
  result: LiveJourney;
  walkIn: Leg | undefined;
  walkOut: Leg | undefined;
}) {
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

  useWaitFlipAlert({
    ready: !!(result.active && bus && active),
    tripGhost: result.tripGhost,
    phase: result.phase,
    waitMin: result.secsToBoard / 60,
    from: fix ?? (walkIn?.kind === "walk" ? { lat: walkIn.to.lat, lng: walkIn.to.lng } : null),
    dest: active ? { lat: active.to.lat, lng: active.to.lng, label: active.to.label } : null,
    routeShort: bus?.routeShort ?? "",
    url: active ? `/trip/${active.option.id}` : "",
  });
}

