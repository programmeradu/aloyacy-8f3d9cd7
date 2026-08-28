// Which honest banners a multi-leg companion shows, and when.
//
// The rules matter more than the pixels: we never stack contradictory
// explanations (a ghost bus is not also a stale feed), and we only ask a
// rider to confirm a sighting when they are physically at the stop.

export type CompanionPhase =
  | "idle"
  | "walking-to-board"
  | "waiting-to-board"
  | "riding"
  | "alight-soon"
  | "walking-to-transfer"
  | "waiting-for-connection"
  | "missed-connection"
  | "walking-to-destination"
  | "arrived"
  | string;

export type BannerTone = "ochre" | "aegean" | "ink";

export type CompanionBanner = {
  id: "ghost" | "rider-tracking" | "feed-stale" | "next-untracked";
  tone: BannerTone;
  title: string;
  body: string;
};

export type BannerInput = {
  active: boolean;
  phase: CompanionPhase;
  tripGhost: boolean;
  vehicleLost: boolean;
  feedStale: boolean;
  hasNextRide: boolean;
  nextRouteShort?: string | null;
  nextVehicleTracked: boolean;
};

const TRANSFER_PHASES = new Set(["walking-to-transfer", "waiting-for-connection"]);
const AT_STOP_PHASES = new Set(["waiting-to-board", "walking-to-board"]);
const RIDING_PHASES = new Set(["riding", "on-bus", "alight-soon"]);

/** Distance (m) inside which a rider can honestly confirm a bus at the stop. */
export const SIGHTING_RADIUS_M = 120;

export function companionBanners(input: BannerInput): CompanionBanner[] {
  if (!input.active) return [];
  const out: CompanionBanner[] = [];

  if (input.tripGhost && !input.vehicleLost) {
    out.push({
      id: "ghost",
      tone: "ochre",
      title: "Ghost bus",
      body: "This trip is on the schedule but the operator hasn't reported it yet. Countdowns are on schedule until GPS appears.",
    });
  }

  if (input.vehicleLost) {
    out.push({
      id: "rider-tracking",
      tone: "aegean",
      title: "Tracking from your phone",
      body: "We lost the operator vehicle. Using your GPS as the bus until it comes back.",
    });
  }

  if (!input.vehicleLost && !input.tripGhost && input.feedStale) {
    out.push({
      id: "feed-stale",
      tone: "ochre",
      title: "Feed is stale",
      body: "The live feed hasn't refreshed recently. Countdowns are on schedule until it recovers.",
    });
  }

  if (TRANSFER_PHASES.has(input.phase) && input.hasNextRide && !input.nextVehicleTracked) {
    const label = input.nextRouteShort?.trim();
    out.push({
      id: "next-untracked",
      tone: "ink",
      title: "Connecting bus not tracked yet",
      body: label
        ? `No GPS from bus ${label} for this run. We're going on schedule for now.`
        : "No GPS from the connecting bus for this run. We're going on schedule for now.",
    });
  }

  return out;
}

/** A one-tap sighting rescues every other rider — but only if it's honest. */
export function shouldOfferSighting(input: {
  active: boolean;
  phase: CompanionPhase;
  tripGhost: boolean;
  hasCurrentRide: boolean;
  metersToTarget: number;
}): boolean {
  return (
    input.active &&
    input.tripGhost &&
    input.hasCurrentRide &&
    AT_STOP_PHASES.has(input.phase) &&
    Number.isFinite(input.metersToTarget) &&
    input.metersToTarget < SIGHTING_RADIUS_M
  );
}

/** Ask the rider already on the bus when the operator feed has gone dark. */
export function shouldAskStillOnBoard(input: {
  active: boolean;
  phase: CompanionPhase;
  tripGhost: boolean;
  vehicleLost: boolean;
  hasCurrentRide: boolean;
}): boolean {
  return (
    input.active &&
    input.hasCurrentRide &&
    RIDING_PHASES.has(input.phase) &&
    (input.tripGhost || input.vehicleLost)
  );
}

/** One push per trip while the rider has left the companion. */
export const STILL_ON_ALERT = "still-on";

export function stillOnBoardPush(routeShort: string): { title: string; body: string } {
  const code = routeShort.trim();
  const bus = code ? `Bus ${code}` : "this bus";
  return {
    title: `Still on ${bus}?`,
    body: "The operator has no GPS. One tap is what people at the next stops see.",
  };
}

/** Riding, feed dark, not already asked. Does not invent a waiter count. */
export function shouldPushStillOnBoard(input: {
  sent: Iterable<string>;
  riding: boolean;
  tripGhost: boolean;
}): boolean {
  if (!input.riding || !input.tripGhost) return false;
  for (const k of input.sent) if (k === STILL_ON_ALERT) return false;
  return true;
}

/** Haptic cue for entering an alert-worthy phase; null means stay quiet. */
export function phaseHaptic(phase: CompanionPhase): "heavy" | "success" | "warning" | null {
  if (phase === "alight-soon") return "heavy";
  if (phase === "arrived") return "success";
  if (phase === "missed-connection") return "warning";
  return null;
}

export function changesLabel(transfers: number): string {
  if (transfers <= 0) return "Direct";
  return transfers === 1 ? "1 change" : `${transfers} changes`;
}
