// Wave 2.2 — apply accessibility preferences as ranking weights on
// already-scored itineraries. We never filter; we only nudge.
//
// Penalties are in "equivalent seconds" added to the score so they compose
// cleanly with the time-based score the planner already produces.

import type { Itinerary, RideLeg, WaitLeg, WalkLeg } from "./itinerary-types";
import { getStopAmenities } from "@/data/stop-amenities";
import type { AccessibilityPrefs } from "./accessibility-prefs";

// Tunables — picked conservatively so an active pref is felt but never
// dominates the score. Comparable to the planner's existing 120s/transfer.
const STEP_FREE_PENALTY_PER_LEG = 60;
const NON_SHADED_PENALTY_PER_LEG = 30;
const SHADED_BONUS_PER_LEG = 20;
const WALK_CAP_PENALTY_PER_M_OVER = 1.0; // seconds per meter over the cap

export function applyAccessibilityWeights(
  itineraries: Itinerary[],
  prefs: AccessibilityPrefs,
): void {
  if (itineraries.length === 0) return;
  const active =
    prefs.stepFree || prefs.preferShade || prefs.maxWalkMeters != null;
  if (!active) return;

  for (const it of itineraries) {
    let delta = 0;

    if (prefs.maxWalkMeters != null) {
      const over = it.totalWalkMeters - prefs.maxWalkMeters;
      if (over > 0) {
        delta += over * WALK_CAP_PENALTY_PER_M_OVER;
      }
    }

    if (prefs.stepFree || prefs.preferShade) {
      for (const leg of it.legs) {
        if (leg.kind === "ride") {
          delta += scoreRideStops(leg, prefs);
        } else if (leg.kind === "wait") {
          delta += scoreWaitStop(leg, prefs);
        } else if (leg.kind === "walk") {
          delta += scoreWalkEndpoints(leg, prefs);
        }
      }
    }

    it.score += delta;
  }
}

function scoreRideStops(leg: RideLeg, prefs: AccessibilityPrefs): number {
  let d = 0;
  const board = getStopAmenities(leg.board.stopId);
  const alight = getStopAmenities(leg.alight.stopId);
  if (prefs.stepFree) {
    if (board && board.stepFree === false) d += STEP_FREE_PENALTY_PER_LEG;
    if (alight && alight.stepFree === false) d += STEP_FREE_PENALTY_PER_LEG;
  }
  if (prefs.preferShade) {
    // Boarding is where the rider waits, so shade matters most there.
    if (board) {
      d += board.shade ? -SHADED_BONUS_PER_LEG : NON_SHADED_PENALTY_PER_LEG;
    }
  }
  return d;
}

function scoreWaitStop(leg: WaitLeg, prefs: AccessibilityPrefs): number {
  // A wait leg means dedicated waiting time at a transfer stop. Shade and
  // step-free both matter; weight roughly by wait length (capped).
  const a = getStopAmenities(leg.stopId);
  if (!a) return 0;
  const weight = Math.min(1, leg.durationSec / 300); // full weight at ≥5 min wait
  let d = 0;
  if (prefs.stepFree && a.stepFree === false) {
    d += STEP_FREE_PENALTY_PER_LEG * weight;
  }
  if (prefs.preferShade) {
    d += (a.shade ? -SHADED_BONUS_PER_LEG : NON_SHADED_PENALTY_PER_LEG) * weight;
  }
  return d;
}

function scoreWalkEndpoints(leg: WalkLeg, prefs: AccessibilityPrefs): number {
  if (!prefs.stepFree) return 0;
  // Only penalise the walk endpoints we know about; unknown stays neutral.
  let d = 0;
  const from = getStopAmenities(leg.from.stopId);
  const to = getStopAmenities(leg.to.stopId);
  if (from && from.stepFree === false) d += STEP_FREE_PENALTY_PER_LEG / 2;
  if (to && to.stepFree === false) d += STEP_FREE_PENALTY_PER_LEG / 2;
  return d;
}
