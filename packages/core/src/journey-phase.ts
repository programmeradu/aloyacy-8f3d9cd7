// Unified journey phase enum used by both single-leg (`useJourney`) and
// multi-leg (`useMultiLegJourney`) hooks. One vocabulary across the app so
// copy, alerts, and analytics never disagree.
//
// Superset of the legacy `LivePhase` and `MultiLegPhase`. Legacy aliases are
// re-exported from the hooks for back-compat — new code should import
// `JourneyPhase` from here.

export type JourneyPhase =
  // shared
  | "idle"
  | "arrived"
  // walking
  | "walking-to-stop" // single-leg legacy
  | "walking-to-board" // multi-leg
  | "walking-to-transfer"
  | "walking-to-dest" // single-leg legacy
  | "walking-to-destination" // multi-leg
  // waiting at a stop
  | "at-stop"
  | "waiting-to-board"
  | "waiting-for-connection"
  | "hurry-soft"
  | "hurry-urgent"
  // bus
  | "boarding"
  | "on-bus"
  | "riding"
  | "alight-soon"
  // failure
  | "missed-bus"
  | "missed-connection";

/** True when the rider is on foot (walking leg of any kind). */
export function isWalking(p: JourneyPhase): boolean {
  return (
    p === "walking-to-stop" ||
    p === "walking-to-board" ||
    p === "walking-to-transfer" ||
    p === "walking-to-dest" ||
    p === "walking-to-destination"
  );
}

/** True when the rider is on a bus. */
export function isRiding(p: JourneyPhase): boolean {
  return p === "on-bus" || p === "riding" || p === "alight-soon";
}

/** True when the rider is stationary waiting for a vehicle. */
export function isWaiting(p: JourneyPhase): boolean {
  return (
    p === "at-stop" ||
    p === "waiting-to-board" ||
    p === "waiting-for-connection" ||
    p === "hurry-soft" ||
    p === "hurry-urgent" ||
    p === "boarding"
  );
}

/** Terminal phases — journey is over (good or bad). */
export function isTerminal(p: JourneyPhase): boolean {
  return p === "arrived" || p === "missed-bus" || p === "missed-connection";
}
