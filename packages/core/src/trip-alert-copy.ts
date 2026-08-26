// Copy for live trip notifications.
//
// The journey hooks emit a semantic intent ("press-stop", "hurry-urgent",
// …) plus the route/stop context; this module turns that into the exact
// title and body a rider sees on the lock screen. Pure, so the wording is
// unit-tested instead of being buried in a notification side effect.

export type TripAlertKind =
  | "at-stop"
  | "hurry-soft"
  | "hurry-urgent"
  | "board-now"
  | "alight-ready"
  | "press-stop"
  | "confirm-onboard"
  | "missed-bus"
  | "arrived"
  | "disruption";

export type TripAlertContext = {
  kind: TripAlertKind;
  routeShort?: string | null;
  stopName?: string | null;
  /** Minutes until the relevant moment, when the caller knows it. */
  minutes?: number | null;
  /** Stops still to be served before the rider's own, when counted. */
  stops?: number | null;
  /** Deep link opened when the rider taps the notification. */
  url?: string | null;
};

export type TripAlertCopy = { id: string; title: string; body: string };

function bus(routeShort?: string | null): string {
  return routeShort ? `bus ${routeShort}` : "your bus";
}

function stop(stopName?: string | null): string {
  return stopName ?? "your stop";
}

function inMinutes(minutes?: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return "shortly";
  const m = Math.max(0, Math.round(minutes));
  if (m <= 0) return "now";
  return m === 1 ? "in 1 min" : `in ${m} min`;
}

/** Build the lock-screen title and body for a live trip moment. */
export function buildTripAlertCopy(ctx: TripAlertContext): TripAlertCopy {
  const id = [ctx.kind, ctx.routeShort ?? "", ctx.stopName ?? ""].join(":");
  switch (ctx.kind) {
    case "at-stop":
      return {
        id,
        title: `${capitalize(bus(ctx.routeShort))} ${inMinutes(ctx.minutes)}`,
        body: `Head to ${stop(ctx.stopName)} — we're watching it for you.`,
      };
    case "hurry-soft":
      return {
        id,
        title: `Pick up the pace for ${bus(ctx.routeShort)}`,
        body: `${capitalize(stop(ctx.stopName))} ${inMinutes(ctx.minutes)}. A brisker walk keeps you on it.`,
      };
    case "hurry-urgent":
      return {
        id,
        title: `Run for ${bus(ctx.routeShort)}`,
        body: `It reaches ${stop(ctx.stopName)} ${inMinutes(ctx.minutes)}.`,
      };
    case "board-now":
      return {
        id,
        title: `${capitalize(bus(ctx.routeShort))} is here`,
        body: `Board now at ${stop(ctx.stopName)}.`,
      };
    case "alight-ready":
      return {
        id,
        title:
          ctx.stops != null && ctx.stops > 0
            ? `${ctx.stops} stops until ${stop(ctx.stopName)}`
            : `${capitalize(stop(ctx.stopName))} is coming up`,
        body: "Gather your things — we'll tell you the moment to press the button.",
      };
    case "press-stop":
      return {
        id,
        title: "Press stop now",
        body: `${capitalize(stop(ctx.stopName))} is next on ${bus(ctx.routeShort)}.`,
      };
    case "confirm-onboard":
      return {
        id,
        title: `Are you on ${bus(ctx.routeShort)}?`,
        body: `Confirm and we'll count down to ${stop(ctx.stopName)}.`,
      };
    case "missed-bus":
      return {
        id,
        title: `Missed ${bus(ctx.routeShort)}`,
        body: "Open Aloya and we'll find you the next best way.",
      };
    case "arrived":
      return { id, title: "You've arrived", body: "Trip complete. Have a great one." };
    case "disruption":
    default:
      return {
        id,
        title: "Your route changed",
        body: `Something shifted on ${bus(ctx.routeShort)}. Tap for the new plan.`,
      };
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
