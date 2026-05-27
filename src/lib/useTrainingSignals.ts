// Bridges the multi-leg phase machine to the training pipeline.
// Emits one event per meaningful transition, idempotent per (legIdx, kind):
//   - "walk-complete"     when a walk leg auto-advances (with measured
//                          duration + planned duration → walk-pace learning)
//   - "transfer-made"     when rider boards the next ride within the
//                          planned wait window
//   - "transfer-missed"   when rider goes past planned wait + 3 min without
//                          boarding the next leg

import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { ActiveTrip } from "./trip-store";
import type { MultiLegLive } from "./useMultiLegJourney";
import { logTrainingEvent } from "./training.functions";
import { getDeviceId } from "./pwa";

export function useTrainingSignals(
  active: ActiveTrip | null,
  live: MultiLegLive,
) {
  const sentRef = useRef<Set<string>>(new Set());
  const prevPhaseRef = useRef<string | null>(null);
  const missedAtRef = useRef<Map<number, number>>(new Map());
  const log = useServerFn(logTrainingEvent);

  useEffect(() => {
    if (!live.active || !active?.itinerary || !active.legState) return;
    const itin = active.itinerary;
    const legState = active.legState;
    const idx = live.currentLegIndex;
    const fireOnce = (key: string, fn: () => void) => {
      if (sentRef.current.has(key)) return;
      sentRef.current.add(key);
      fn();
    };
    const deviceId = getDeviceId();
    const now = Date.now();
    const hourOfDay = new Date(now).getHours();
    const dayOfWeek = new Date(now).getDay();

    // ---- Phase-transition logging (every change) ----
    const curRide = live.currentRideLeg;
    if (prevPhaseRef.current !== live.phase) {
      const from = prevPhaseRef.current;
      prevPhaseRef.current = live.phase;
      if (from) {
        log({
          data: {
            deviceId,
            kind: "phase-transition",
            payload: {
              from,
              to: live.phase,
              legIdx: idx,
              routeShort: curRide?.routeShort ?? live.nextRideLeg?.routeShort ?? null,
              routeId: curRide?.routeId ?? live.nextRideLeg?.routeId ?? null,
              stopId: curRide?.board.stopId ?? live.nextRideLeg?.board.stopId ?? null,
              hourOfDay,
              dayOfWeek,
            },
          },
        }).catch(() => {});
      }
    }

    // ---- Boarding-prompt coverage ----
    // Prompt is shown whenever phase enters waiting-to-board on a ride leg.
    if (live.phase === "waiting-to-board" && curRide) {
      fireOnce(`prompt-shown:${idx}`, () =>
        log({
          data: {
            deviceId,
            kind: "boarding-prompt-shown",
            payload: {
              legIdx: idx,
              routeShort: curRide.routeShort,
              routeId: curRide.routeId,
              stopId: curRide.board.stopId,
              hourOfDay,
              dayOfWeek,
            },
          },
        }).catch(() => {}),
      );
    }
    // Confirmed: any ride leg with onBoardConfirmedAt set.
    for (let i = 0; i <= idx; i++) {
      const leg = itin.legs[i];
      const per = legState.perLeg[i];
      if (!leg || leg.kind !== "ride" || !per?.onBoardConfirmedAt) continue;
      fireOnce(`prompt-confirmed:${i}`, () =>
        log({
          data: {
            deviceId,
            kind: "boarding-prompt-confirmed",
            payload: {
              legIdx: i,
              routeShort: leg.routeShort,
              routeId: leg.routeId,
              stopId: leg.board.stopId,
              latencyMs: per.onBoardConfirmedAt!
                ? Math.max(0, per.onBoardConfirmedAt - (per.enteredAt ?? per.onBoardConfirmedAt))
                : 0,
              hourOfDay,
              dayOfWeek,
            },
          },
        }).catch(() => {}),
      );
    }

    // ---- Missed-bus false positives ----
    // Track when missedAt fires; if onBoardConfirmedAt arrives within 4 min,
    // it's a false positive.
    for (let i = 0; i <= idx; i++) {
      const leg = itin.legs[i];
      const per = legState.perLeg[i];
      if (!leg || leg.kind !== "ride" || !per?.missedAt) continue;
      if (!missedAtRef.current.has(i)) missedAtRef.current.set(i, per.missedAt);
      if (per.onBoardConfirmedAt && per.onBoardConfirmedAt - per.missedAt < 4 * 60_000) {
        fireOnce(`missed-fp:${i}`, () =>
          log({
            data: {
              deviceId,
              kind: "missed-bus-false-positive",
              payload: {
                legIdx: i,
                routeShort: leg.routeShort,
                routeId: leg.routeId,
                stopId: leg.board.stopId,
                gapMs: per.onBoardConfirmedAt! - per.missedAt!,
                hourOfDay,
                dayOfWeek,
              },
            },
          }).catch(() => {}),
        );
      }
    }


    // Walk-complete: when a walk leg was just completed (any previous leg
    // marked completedAt and was a walk).
    for (let i = 0; i < idx; i++) {
      const leg = itin.legs[i];
      const per = legState.perLeg[i];
      if (!leg || leg.kind !== "walk" || !per?.enteredAt || !per?.completedAt) continue;
      const actualSec = Math.round((per.completedAt - per.enteredAt) / 1000);
      if (actualSec < 5 || actualSec > 3 * leg.durationSec + 300) continue;
      fireOnce(`walk-complete:${i}`, () =>
        log({
          data: {
            deviceId,
            kind: "walk-complete",
            payload: {
              legIdx: i,
              plannedSec: leg.durationSec,
              actualSec,
              distanceM: leg.distanceMeters,
            },
          },
        }).catch(() => {}),
      );
    }

    // Transfer-made: rider just confirmed onBoard on a ride leg that came
    // after another ride leg (i.e. they made the connection).
    const cur = itin.legs[idx];
    const per = legState.perLeg[idx];
    if (cur?.kind === "ride" && per?.onBoardConfirmedAt) {
      const prevRideIdx = (() => {
        for (let i = idx - 1; i >= 0; i--) if (itin.legs[i]?.kind === "ride") return i;
        return -1;
      })();
      if (prevRideIdx >= 0) {
        const prevRide = itin.legs[prevRideIdx];
        const waitLeg = itin.legs.slice(prevRideIdx + 1, idx).find((l) => l.kind === "wait");
        if (prevRide?.kind === "ride" && cur.kind === "ride") {
          fireOnce(`transfer-made:${idx}`, () =>
            log({
              data: {
                deviceId,
                kind: "transfer-made",
                payload: {
                  fromRoute: prevRide.routeShort,
                  toRoute: cur.routeShort,
                  atStopId: cur.board.stopId,
                  plannedWaitSec: waitLeg?.kind === "wait" ? waitLeg.durationSec : 0,
                },
              },
            }).catch(() => {}),
          );
        }
      }
    }

    // Transfer-missed: phase reports missed-connection.
    if (live.phase === "missed-connection" && live.currentRideLeg && live.nextRideLeg) {
      fireOnce(`transfer-missed:${idx}`, () =>
        log({
          data: {
            deviceId,
            kind: "transfer-missed",
            payload: {
              fromRoute: live.currentRideLeg!.routeShort,
              toRoute: live.nextRideLeg!.routeShort,
              atStopId: live.nextRideLeg!.board.stopId,
            },
          },
        }).catch(() => {}),
      );
    }
  }, [
    live.active,
    live.phase,
    live.currentLegIndex,
    live.currentRideLeg,
    live.nextRideLeg,
    active,
    log,
  ]);
}
