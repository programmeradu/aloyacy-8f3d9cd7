// Remaining-time math for a multi-leg journey in progress.
//
// Pure and platform-free so web and native companions agree on the number
// shown next to "arrive". Structural inputs only — the caller passes the
// bits of its own live-state object rather than importing a hook type.

/** The slice of live journey state the ETA depends on. */
export type MultiLegProgress = {
  /** Index of the leg the rider is currently on. */
  currentLegIndex: number;
  /** Live seconds until the current ride's alight, when known. */
  secsToCurrentAlight?: number | null;
  /** Scheduled duration of the current leg, used when there is no live value. */
  currentLegDurationSec?: number | null;
};

/** Any leg-shaped object; only `durationSec` matters here. */
export type DurationLeg = { durationSec?: number | null };

/**
 * Minutes from now to the end of the itinerary: the remainder of the current
 * leg (live estimate preferred over schedule) plus every later leg's duration.
 * Negative and non-finite inputs are floored to zero so a bad feed value can
 * never make the ETA run backwards.
 */
export function remainingMinutesToDestination(
  progress: MultiLegProgress,
  legs: readonly DurationLeg[],
): number {
  let secs = 0;

  const live = progress.secsToCurrentAlight;
  if (typeof live === "number" && Number.isFinite(live)) {
    secs += Math.max(0, live);
  } else {
    const sched = progress.currentLegDurationSec;
    if (typeof sched === "number" && Number.isFinite(sched)) {
      secs += Math.max(0, sched);
    }
  }

  for (let i = progress.currentLegIndex + 1; i < legs.length; i++) {
    const d = legs[i]?.durationSec;
    if (typeof d === "number" && Number.isFinite(d)) secs += Math.max(0, d);
  }

  return Math.max(0, Math.round(secs / 60));
}
