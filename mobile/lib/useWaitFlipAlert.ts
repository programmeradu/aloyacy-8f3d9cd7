// One local alert if dest-bail's walk-vs-wait holds 60s then flips.
// HUD dest-bail stays the live sentence; this is the B5 push.

import { useEffect, useRef } from "react";
import {
  destBailForWait,
  EMPTY_WAIT_FLIP_HOLD,
  tickWaitFlip,
  waitFlipPhase,
  type WaitFlipHold,
} from "@aloya/core/dest-bail";
import { sendLocalTripAlert } from "./tripAlerts";

export function useWaitFlipAlert(input: {
  ready: boolean;
  tripGhost: boolean;
  phase: string;
  waitMin: number;
  from: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number; label: string } | null;
  routeShort: string;
  url: string;
}) {
  const holdRef = useRef<WaitFlipHold>(EMPTY_WAIT_FLIP_HOLD);
  const { ready, tripGhost, phase, waitMin, from, dest, routeShort, url } = input;

  useEffect(() => {
    if (!ready || !dest) {
      holdRef.current = EMPTY_WAIT_FLIP_HOLD;
      return;
    }
    const action = destBailForWait({
      dark: tripGhost,
      phase: waitFlipPhase(phase),
      waitMin,
      from,
      to: dest,
      destLabel: dest.label,
      routeShort,
    });
    const { hold, flip } = tickWaitFlip(
      holdRef.current,
      action,
      Math.floor(Date.now() / 1000),
    );
    holdRef.current = hold;
    if (!flip) return;
    void sendLocalTripAlert({
      kind: "wait-flip",
      routeShort: flip.to.routeShort,
      minutes: flip.to.waitMin,
      walkMin: flip.to.walkMin,
      flipTo: flip.to.kind,
      ...(flip.to.kind === "walk" ? { stopName: flip.to.destLabel } : {}),
      url,
    });
  }, [ready, tripGhost, phase, waitMin, from, dest, routeShort, url]);
}
