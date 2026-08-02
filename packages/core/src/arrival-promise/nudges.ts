// Nudge escalation and promise status transitions.

export type NudgeKind = "t60" | "t30" | "t15" | "now" | "changed" | "unmakeable";

export type PromiseStatus = "watching" | "leave-now" | "departed" | "missed" | "cancelled" | "done";

export type PromiseSnapshot = {
  leaveByUnix: number;
  /** Leave time when the promise was created — used to detect drift. */
  baselineLeaveByUnix: number;
  targetArrivalUnix: number;
  status: PromiseStatus;
  nudgesSent: readonly string[];
  /** True when the current ladder can no longer make the target. */
  unmakeable?: boolean;
};

/** Escalation points, in seconds before the recommended leave time. */
export const NUDGE_STEPS: Array<{ kind: NudgeKind; leadSec: number }> = [
  { kind: "t60", leadSec: 60 * 60 },
  { kind: "t30", leadSec: 30 * 60 },
  { kind: "t15", leadSec: 15 * 60 },
  { kind: "now", leadSec: 0 },
];

/** A leave time moving this much earlier is worth an out-of-band ping. */
export const DRIFT_ALERT_SEC = 5 * 60;

/**
 * Which single nudge is due right now, or null. Idempotent: anything already
 * in nudgesSent is never returned again, so a re-run of the cron tick after a
 * crash cannot double-notify.
 *
 * Priority is honesty-first: "you can no longer make it" outranks "leave now",
 * which outranks the fixed countdown steps, which outrank drift.
 */
export function nextNudge(p: PromiseSnapshot, nowUnix: number): NudgeKind | null {
  if (p.status !== "watching" && p.status !== "leave-now") return null;
  const sent = new Set(p.nudgesSent);

  if (p.unmakeable && !sent.has("unmakeable")) return "unmakeable";

  const secUntilLeave = p.leaveByUnix - nowUnix;

  // Too late to act on: don't fire a stale "leave now" hours after the fact.
  if (secUntilLeave < -15 * 60) return null;

  for (const step of NUDGE_STEPS) {
    if (secUntilLeave <= step.leadSec && !sent.has(step.kind)) {
      // Never fire a lead-time step that was already overtaken by a closer
      // one (e.g. the promise was created 20 min before departure: t60 and
      // t30 are moot, t15 is the right first ping).
      const closer = NUDGE_STEPS.find(
        (s) => s.leadSec < step.leadSec && secUntilLeave <= s.leadSec && !sent.has(s.kind),
      );
      if (closer) continue;
      return step.kind;
    }
  }

  // Conditions worsened enough that the plan itself changed.
  if (
    !sent.has("changed") &&
    p.baselineLeaveByUnix - p.leaveByUnix >= DRIFT_ALERT_SEC &&
    secUntilLeave > 0
  ) {
    return "changed";
  }

  return null;
}

export function promiseStatusFor(
  p: {
    leaveByUnix: number;
    targetArrivalUnix: number;
    status: PromiseStatus;
    unmakeable?: boolean;
  },
  nowUnix: number,
): PromiseStatus {
  if (p.status === "cancelled" || p.status === "departed" || p.status === "done") return p.status;
  if (nowUnix > p.targetArrivalUnix) return "done";
  if (p.unmakeable) return "missed";
  if (nowUnix >= p.leaveByUnix) return "leave-now";
  return "watching";
}

// ---------------------------------------------------------------------------
// Watch cadence
// ---------------------------------------------------------------------------

/**
 * How often to re-plan, given how far out the departure is. Far-off promises
 * barely move, so re-planning them every two minutes would burn the planner
 * for nothing; the last hour is where accuracy actually matters.
 */
export function replanIntervalSec(secUntilLeave: number): number {
  if (secUntilLeave <= 60 * 60) return 0; // every tick
  if (secUntilLeave <= 6 * 60 * 60) return 15 * 60;
  return 60 * 60;
}

export function isReplanDue(args: {
  nowUnix: number;
  leaveByUnix: number;
  lastReplanUnix: number | null;
}): boolean {
  const interval = replanIntervalSec(args.leaveByUnix - args.nowUnix);
  if (args.lastReplanUnix == null) return true;
  return args.nowUnix - args.lastReplanUnix >= interval;
}
