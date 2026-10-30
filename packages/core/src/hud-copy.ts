// Live journey HUD copy + phase visibility — pure helpers shared by the web
// and native HUDs so both read identically for the same phase machine state.

export type JourneyPhase =
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
  | "arrived"
  | (string & {});

/** Human duration from seconds: "under a minute", "1 min", "12 min". */
export function fmtMin(sec: number): string {
  if (!Number.isFinite(sec)) return "-";
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 1) return "under a minute";
  if (m === 1) return "1 min";
  return `${m} min`;
}

/** Human distance from metres: "180 m", "1.4 km". */
export function fmtDist(m: number): string {
  if (!Number.isFinite(m) || m < 0) return "-";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export interface HudVisibility {
  start: boolean;
  hurry: boolean;
  step: boolean;
  atStop: boolean;
  boarding: boolean;
  missed: boolean;
  riding: boolean;
  arrived: boolean;
}

/** Which HUD cards belong on screen for a phase. Exactly mirrors the web HUD. */
export function hudVisibility(input: {
  active: boolean;
  phase: JourneyPhase;
  hasSteps: boolean;
}): HudVisibility {
  const { active, phase, hasSteps } = input;
  const off: HudVisibility = {
    start: false,
    hurry: false,
    step: false,
    atStop: false,
    boarding: false,
    missed: false,
    riding: false,
    arrived: false,
  };
  if (!active) return { ...off, start: true };
  const hurrying = phase === "hurry-soft" || phase === "hurry-urgent";
  const walking = hurrying || phase === "walking-to-stop" || phase === "walking-to-dest";
  return {
    ...off,
    hurry: hurrying,
    step: walking && hasSteps,
    atStop: phase === "at-stop",
    boarding: phase === "boarding",
    missed: phase === "missed-bus",
    riding: phase === "on-bus" || phase === "alight-soon",
    arrived: phase === "arrived",
  };
}

export function hurryCopy(urgent: boolean): { kicker: string; body: string } {
  return urgent
    ? {
        kicker: "Hurry, bus is here",
        body: "Wave it down as you approach, the driver can still see you.",
      }
    : {
        kicker: "Pace up",
        body: "Pick up the pace slightly and you'll make the stop in time.",
      };
}

/** Headline for the hurry banner: "Bus in 2 min · walk 4 min". */
export function hurryHeadline(secsToBoard: number, walkingEtaSec: number): string {
  return `Bus in ${fmtMin(secsToBoard)} · walk ${fmtMin(walkingEtaSec)}`;
}

export function boardingBody(input: {
  onBoardSuggested: boolean;
  secondsLeft: number;
  alightName: string;
}): string {
  if (input.onBoardSuggested) {
    const s = Math.max(0, Math.round(input.secondsLeft));
    return `Looks like you're on board, auto-confirming in ${s}s.`;
  }
  return `We'll press-stop at ${input.alightName}. Tap "I'm on" once you board.`;
}

export function ridingBody(vehicleLost: boolean): string {
  return vehicleLost
    ? "We lost the operator feed, so we're tracking you directly. Countdown still fires."
    : "Sit back. We'll buzz two stops before yours, then press-stop with you.";
}

/** Prefers the fused (rider-GPS corrected) ETA when we have one. */
export function alightEtaSec(fusedSecsToAlight: number, secsToAlight: number): number {
  return fusedSecsToAlight > 0 ? fusedSecsToAlight : Math.max(0, secsToAlight);
}

/** Human maneuver label: "turn left", "straight" when the feed omits it. */
export function maneuverLabel(maneuver?: string | null): string {
  const raw = (maneuver ?? "").trim();
  return (raw || "straight").replace(/[-_]/g, " ");
}

/** Index of the step to render, clamped to the available steps. */
export function activeStepIndex(currentStepIndex: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  const i = Number.isFinite(currentStepIndex) ? Math.floor(currentStepIndex) : 0;
  return Math.min(Math.max(0, i), stepCount - 1);
}

/** One tick of the boarding auto-confirm countdown. */
export function countdownTick(n: number): { next: number; confirm: boolean } {
  if (n <= 1) return { next: 0, confirm: true };
  return { next: n - 1, confirm: false };
}
