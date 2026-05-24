// Detects when the rider is already so close to their destination that the
// remaining itinerary (transfers, extra bus) is wasted effort — and offers
// to collapse the rest of the trip into a single final walk.
//
// Trigger conditions (all must hold):
//   • current leg is NOT the final walk-to-destination (i.e. there are
//     still ride/wait/walk-transfer legs queued)
//   • distance from current GPS to the destination is < 250 m
//   • that distance has been DECREASING over the last 3 fixes (so a bus
//     passing by the destination doesn't false-trigger when stationary)
//   • the rider hasn't already dismissed the prompt this trip

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveFix } from "./useGeoWatch";
import { distanceM } from "./geo";
import type { ActiveTrip } from "./trip-store";

const TRIGGER_DISTANCE_M = 250;
const HISTORY_LEN = 3;

export function useShortcutDetector(opts: {
  active: ActiveTrip | null;
  fix: LiveFix | null;
  currentLegIndex: number;
  isOnFinalWalk: boolean;
}): {
  shouldPrompt: boolean;
  distanceM: number;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState(false);
  const historyRef = useRef<number[]>([]);

  // Reset dismissal whenever a new trip starts.
  useEffect(() => {
    setDismissed(false);
    historyRef.current = [];
  }, [opts.active?.startedAt]);

  const dist = useMemo(() => {
    if (!opts.fix || !opts.active) return Infinity;
    return distanceM(opts.fix, {
      lat: opts.active.to.lat,
      lng: opts.active.to.lng,
    });
  }, [opts.fix, opts.active]);

  // Roll the history window.
  useEffect(() => {
    if (!Number.isFinite(dist)) return;
    const h = historyRef.current;
    h.push(dist);
    if (h.length > HISTORY_LEN) h.shift();
  }, [dist]);

  const shouldPrompt = useMemo(() => {
    if (dismissed) return false;
    if (opts.isOnFinalWalk) return false;
    if (!opts.active?.itinerary) return false;
    if (!Number.isFinite(dist)) return false;
    if (dist > TRIGGER_DISTANCE_M) return false;
    const h = historyRef.current;
    if (h.length < HISTORY_LEN) return false;
    // Strictly non-increasing trend (allow tiny GPS noise).
    for (let i = 1; i < h.length; i++) {
      if (h[i] > h[i - 1] + 10) return false;
    }
    return true;
  }, [dismissed, opts.isOnFinalWalk, opts.active?.itinerary, dist]);

  return {
    shouldPrompt,
    distanceM: dist,
    dismiss: () => setDismissed(true),
  };
}
