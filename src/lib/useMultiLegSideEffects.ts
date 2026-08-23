// Side-effects orchestrator for MultiLegJourney:
// - Push alerts on phase transition
// - Crowdsourced bus position reporting
// - Commute pattern learning on arrival

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDeviceId } from "./pwa";
import { sendTripAlert } from "./push.functions";
import { useRiderFixReporter } from "./useRiderFixReporter";
import { recordCommutePattern } from "./commute-learner.functions";
import { multiLegAlerts, type MultiLegPhase } from "@aloya/core/multileg-journey";
import type { ActiveTrip } from "./trip-store";
import type { RideLeg } from "./itinerary-types";
import type { LiveFix } from "./useGeoWatch";

export interface UseMultiLegSideEffectsOptions {
  active: ActiveTrip | null;
  phase: MultiLegPhase;
  currentLegIndex: number;
  currentRideLeg: RideLeg | null;
  nextRideLeg: RideLeg | null;
  secsToNextBoard: number;
  nextBoardLate: boolean;
  fix: LiveFix | null;
  onBoard: boolean;
}

export function useMultiLegSideEffects({
  active,
  phase,
  currentLegIndex,
  currentRideLeg,
  nextRideLeg,
  secsToNextBoard,
  nextBoardLate,
  fix,
  onBoard,
}: UseMultiLegSideEffectsOptions) {
  const itin = active?.itinerary;

  // ---- Push alerts on phase transition ------------------------------------
  const sentRef = useRef<Set<string>>(new Set());
  const sendAlert = useServerFn(sendTripAlert);

  useEffect(() => {
    if (!active || !itin) return;
    const deviceId = getDeviceId();
    const url = `/trip/${active.option.id}`;

    for (const alert of multiLegAlerts({
      phase,
      legIndex: currentLegIndex,
      currentRideLeg,
      nextRideLeg,
      secsToNextBoard,
      nextBoardLate,
    })) {
      if (sentRef.current.has(alert.key)) continue;
      sentRef.current.add(alert.key);
      sendAlert({
        data: {
          deviceId,
          kind: alert.kind,
          url,
          ...(alert.routeShort ? { routeShort: alert.routeShort } : {}),
          ...(alert.stopName ? { stopName: alert.stopName } : {}),
          ...(alert.minutes != null ? { minutes: alert.minutes } : {}),
        },
      }).catch(() => {});
    }
  }, [
    phase,
    currentLegIndex,
    secsToNextBoard,
    nextBoardLate,
    active,
    itin,
    sendAlert,
    currentRideLeg,
    nextRideLeg,
  ]);

  // ---- Crowdsourced bus position: report rider GPS while on board --------
  useRiderFixReporter({
    enabled: !!active && !!currentRideLeg && onBoard,
    fix,
    tripId: currentRideLeg?.tripId ?? null,
    routeId: currentRideLeg?.routeId,
  });

  // ---- Commute pattern learner: record once on arrival ------------------
  const recordCommute = useServerFn(recordCommutePattern);
  const recordedRef = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== "arrived" || !itin || !active) return;
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
      recordedRef.current = null;
    });
  }, [phase, itin, active, recordCommute]);
}
