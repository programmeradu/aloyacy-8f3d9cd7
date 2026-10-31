// Worker entry for the schedule RAPTOR: the pure search in ./raptor-plan with
// the server-only signals (skip rates, walk quality, verified walk links).

import { planRaptor as planRaptorCore, type RaptorDiagnostics } from "./raptor-plan";
import type { LoadedSchedule } from "./schedule-types";
import type { AccessibilityPrefs } from "@aloya/core/raptor-core";
import { loadSkipFractionMap } from "./skip-rate.server";
import { loadStopWalkQuality, loadVerifiedWalkLinks } from "./walk-quality.server";

export type { RaptorDiagnostics };

export function planRaptor(
  schedule: LoadedSchedule,
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  departureUnix: number,
  opts?: { searchHorizonSec?: number; maxJourneySec?: number; accessibilityPrefs?: AccessibilityPrefs },
) {
  return planRaptorCore(schedule, from, to, departureUnix, {
    ...opts,
    deps: {
      loadSkipFractionMap,
      loadStopWalkQuality: loadStopWalkQuality as never,
      loadVerifiedWalkLinks: loadVerifiedWalkLinks as never,
    },
  });
}
