// Single-leg trip companion: phase derivation and rider-facing copy.
//
// Both the web companion (`src/routes/trip.$id.tsx`) and the native one
// (`mobile/app/trip/[id].tsx`) used to carry their own copy of this
// reasoning. It is pure arithmetic over unix seconds plus wording, so it
// lives here where it can be pinned by tests and can never drift between
// the two clients.

export type SingleLegPhase =
  "leave-soon" | "walking" | "waiting" | "on-bus" | "alight-soon" | "arrived";

/** Phase names emitted by the GPS-truth journey tracker. */
export type LiveJourneyPhase =
  | "idle"
  | "walking-to-stop"
  | "hurry-soft"
  | "hurry-urgent"
  | "at-stop"
  | "boarding"
  | "missed-bus"
  | "on-bus"
  | "alight-soon"
  | "walking-to-dest"
  | "arrived";

export type SchedulePhaseInput = {
  /** Current time, unix seconds. */
  nowUnix: number;
  /** Scheduled or live departure from the boarding stop. */
  boardUnix: number;
  /** Scheduled or live arrival at the alighting stop. */
  alightUnix: number;
  /** Access walk (origin → boarding stop), seconds. */
  walkInSec: number;
  /** Egress walk (alighting stop → destination), seconds. */
  walkOutSec: number;
  /** When the rider started the trip, unix seconds; null before they set off. */
  startedAtUnix?: number | null;
  /** Rider confirmed they are on the bus. */
  onBoard?: boolean;
  /** Rider confirmed they stepped off. */
  alighted?: boolean;
};

export type SchedulePhaseResult = {
  phase: SingleLegPhase;
  /** Minutes until the rider must set off on foot (can go negative). */
  minToLeave: number;
  minToBoard: number;
  minToAlight: number;
  /** Minutes until the rider is at the door, walk included. */
  minToDoor: number;
};

const minutesUntil = (unix: number, now: number) => Math.round((unix - now) / 60);

/**
 * Derives the companion phase from the schedule plus whatever the rider has
 * confirmed. Confirmations win over the clock: a rider who says they are on
 * board is on board even if the timetable disagrees.
 */
export function deriveSchedulePhase(input: SchedulePhaseInput): SchedulePhaseResult {
  const {
    nowUnix: now,
    boardUnix,
    alightUnix,
    walkInSec,
    walkOutSec,
    startedAtUnix = null,
    onBoard = false,
    alighted = false,
  } = input;

  const leaveByUnix = boardUnix - walkInSec;
  const minToLeave = minutesUntil(leaveByUnix, now);
  const minToBoard = minutesUntil(boardUnix, now);
  const minToAlight = minutesUntil(alightUnix, now);
  const minToDoor = minutesUntil(alightUnix + walkOutSec, now);

  let phase: SingleLegPhase;
  if (alighted) {
    phase = minToDoor > 0 ? "alight-soon" : "arrived";
  } else if (onBoard) {
    phase = minToAlight > 2 ? "on-bus" : minToAlight > -1 ? "alight-soon" : "arrived";
  } else if (startedAtUnix != null) {
    // Under way on foot: 30s of slack so a brisk walker isn't told they are
    // still walking once they are visibly standing at the stop.
    const secsSinceStart = now - startedAtUnix;
    phase = secsSinceStart < walkInSec - 30 ? "walking" : "waiting";
  } else if (minToLeave > 1) {
    phase = "leave-soon";
  } else if (minToBoard > 1) {
    phase = "walking";
  } else if (now < boardUnix) {
    phase = "waiting";
  } else if (minToAlight > 2) {
    phase = "on-bus";
  } else if (minToAlight > -1) {
    phase = "alight-soon";
  } else {
    phase = "arrived";
  }

  return { phase, minToLeave, minToBoard, minToAlight, minToDoor };
}

/** Collapses the fine-grained live phases onto the six hero phases. */
export const LIVE_PHASE_TO_HERO: Record<LiveJourneyPhase, SingleLegPhase | null> = {
  // `idle` means the tracker has nothing better than the schedule.
  idle: null,
  "walking-to-stop": "walking",
  "hurry-soft": "walking",
  "hurry-urgent": "walking",
  "at-stop": "waiting",
  boarding: "waiting",
  // A missed bus puts the rider back on foot toward the next option.
  "missed-bus": "walking",
  "on-bus": "on-bus",
  "alight-soon": "alight-soon",
  "walking-to-dest": "arrived",
  arrived: "arrived",
};

/** Live phase wins when the tracker is active and has an opinion. */
export function resolveHeroPhase(
  schedulePhase: SingleLegPhase,
  live: { active: boolean; phase: LiveJourneyPhase } | null,
): SingleLegPhase {
  if (!live?.active) return schedulePhase;
  return LIVE_PHASE_TO_HERO[live.phase] ?? schedulePhase;
}

/** Which walk, if any, the rider is on right now. */
export function walkingPhaseFor(
  phase: SingleLegPhase,
  alighted: boolean,
): "to-stop" | "to-dest" | null {
  if (alighted) return "to-dest";
  if (phase === "leave-soon" || phase === "walking" || phase === "waiting") {
    return "to-stop";
  }
  if (phase === "arrived" || phase === "alight-soon") return "to-dest";
  return null;
}

/** Short state word shown in the hero kicker. */
export function phaseLabel(phase: SingleLegPhase): string {
  switch (phase) {
    case "leave-soon":
      return "Get ready";
    case "walking":
      return "On your way";
    case "waiting":
      return "At the stop";
    case "on-bus":
      return "On board";
    case "alight-soon":
      return "Almost there";
    default:
      return "Arrived";
  }
}

/** Plain-language punctuality, ignoring sub-minute noise. */
export function delayCopy(delaySec: number): string {
  if (delaySec > 60) return `${Math.round(delaySec / 60)} min late`;
  if (delaySec < -60) return `${Math.round(-delaySec / 60)} min early`;
  return "on time";
}

export type HeadlineInput = {
  phase: SingleLegPhase;
  minToLeave: number;
  minToBoard: number;
  minToAlight: number;
  minToDoor: number;
  boardName: string;
  alightName: string;
};

/** Hero headline plus its supporting line. Counts never render negative. */
export function phaseHeadline(i: HeadlineInput): { big: string; small: string } {
  const clamp = (n: number) => Math.max(0, n);
  switch (i.phase) {
    case "leave-soon":
      return {
        big: `Leave in ${clamp(i.minToLeave)} min`,
        small: `Walk to ${i.boardName}.`,
      };
    case "walking":
      return {
        big: `Bus in ${clamp(i.minToBoard)} min`,
        small: `Keep heading for ${i.boardName}.`,
      };
    case "waiting":
      return {
        big: `Boards in ${clamp(i.minToBoard)} min`,
        small: `At ${i.boardName}.`,
      };
    case "on-bus":
      return {
        big: `Off in ${clamp(i.minToAlight)} min`,
        small: `At ${i.alightName}.`,
      };
    case "alight-soon":
      return { big: "Step off next", small: `${i.alightName}.` };
    default:
      return {
        big: "You're there",
        small: `${clamp(i.minToDoor)} min walk left.`,
      };
  }
}

export type SubcopyInput = {
  phase: SingleLegPhase;
  walkInSec: number;
  walkOutSec: number;
  destName: string;
  boardName: string;
  alightName: string;
  minToDoor: number;
};

/** The calm paragraph under the headline. */
export function phaseSubcopy(i: SubcopyInput): string {
  const walkIn = Math.round(i.walkInSec / 60);
  const walkOut = Math.round(i.walkOutSec / 60);
  switch (i.phase) {
    case "leave-soon":
      return `About ${walkIn} min on foot to the stop.`;
    case "walking":
      return `About ${walkIn} min to ${i.boardName}. We'll buzz if the bus slips.`;
    case "waiting":
      return `Wait at ${i.boardName}. We'll press-stop for you before ${i.alightName}.`;
    case "on-bus":
      return `Sit back. ${walkOut} min walk after ${i.alightName}.`;
    case "alight-soon":
      return `Ring the bell. ${walkOut} min walk to ${i.destName}.`;
    default:
      return `${Math.max(0, i.minToDoor)} min to ${i.destName}. Nice one.`;
  }
}

/** True when the "press stop" alert should be on screen. */
export function shouldShowAlightAlert(phase: SingleLegPhase, minToAlight: number): boolean {
  return phase === "alight-soon" || (phase === "on-bus" && minToAlight <= 3);
}
