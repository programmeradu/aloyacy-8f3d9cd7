// Pure helpers behind the trip-planning screens (web + mobile).
//
// Everything here is deliberately free of React, storage, and network access
// so the rules that decide *what* we plan — the departure/arrival clock, the
// walk legs we care about, whether a Kapnos coach stop is reachable on foot,
// and how a handoff from the "Ask Aloya" composer is interpreted — can be
// unit-tested without mounting a screen.

export type PlanTimeIntent =
  | { kind: "now" }
  | { kind: "leaveBy"; iso: string }
  | { kind: "arriveBy"; iso: string };

export type PlanClock = {
  departAtUnix?: number;
  arriveByUnix?: number;
};

export type PlanPlace = { lat: number; lng: number; label: string };

/** Minimal structural shape of an itinerary leg — matches web + mobile DTOs. */
export type LegLike = {
  kind: string;
  /** Present on walk legs only. */
  distanceMeters?: number;
  /** Present on walk legs only — the point the rider starts walking from. */
  from?: { stopId?: string; name: string; lat: number; lng: number };
};

/**
 * Translate a rider's time intent into the planner's unix arguments.
 * "now" carries no clock at all so the planner uses server time.
 */
export function intentToUnix(intent: PlanTimeIntent): PlanClock {
  if (intent.kind === "leaveBy" || intent.kind === "arriveBy") {
    const ms = new Date(intent.iso).getTime();
    if (!Number.isFinite(ms)) return {};
    const unix = Math.floor(ms / 1000);
    return intent.kind === "leaveBy" ? { departAtUnix: unix } : { arriveByUnix: unix };
  }
  return {};
}

/**
 * Kapnos publishes local wall-clock strings ("2026-08-22 14:30") with no zone.
 * Cyprus runs UTC+03:00 in summer time, which is when the coach timetable is
 * published, so pin the offset rather than trusting the device zone.
 */
export function parseKapnosLocalUnix(local: string | null | undefined): number | undefined {
  if (!local) return undefined;
  const t = Date.parse(local.replace(" ", "T") + ":00+03:00");
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

/** Metres of the access walk before the first ride. 0 when the trip starts on a bus. */
export function firstWalkMeters(legs: readonly LegLike[] | null | undefined): number | null {
  if (!legs) return null;
  const w = legs.find((l) => l.kind === "walk");
  return w && typeof w.distanceMeters === "number" ? Math.round(w.distanceMeters) : 0;
}

export type FinalWalk = {
  meters: number;
  alight: { lat: number; lng: number; name: string };
};

/**
 * The egress walk — the last walk leg that happens *after* a ride. A walk-only
 * itinerary has no egress (there is nothing to chain a scooter onto), so it
 * returns null rather than pretending the origin is a bus stop.
 */
export function finalWalkLeg(legs: readonly LegLike[] | null | undefined): FinalWalk | null {
  if (!legs) return null;
  for (let i = legs.length - 1; i >= 0; i--) {
    const leg = legs[i];
    if (leg.kind !== "walk" || !leg.from || typeof leg.distanceMeters !== "number") continue;
    const hasPriorRide = legs.slice(0, i).some((p) => p.kind === "ride");
    if (!hasPriorRide) return null;
    return {
      meters: Math.round(leg.distanceMeters),
      alight: { lat: leg.from.lat, lng: leg.from.lng, name: leg.from.name },
    };
  }
  return null;
}

/** Beyond this, "walk to the coach stop" stops being honest advice. */
export const KAPNOS_WALKABLE_M = 1_200;

export function isBeyondWalking(distanceM: number | null | undefined): boolean {
  return typeof distanceM === "number" && distanceM > KAPNOS_WALKABLE_M;
}

/**
 * Where the trip actually starts. Falls back to a city centroid only when the
 * rider asked for their location and we have no fix at all.
 */
export function resolveOrigin(args: {
  useCurrent: boolean;
  fix: { lat: number; lng: number } | null;
  picked: PlanPlace | null;
  fallback: PlanPlace;
}): PlanPlace {
  const { useCurrent, fix, picked, fallback } = args;
  if (useCurrent) {
    return fix ? { lat: fix.lat, lng: fix.lng, label: "Current location" } : fallback;
  }
  return picked ?? fallback;
}

/** Handoff written by the "Ask Aloya" composer before it routes to the planner. */
export type PlanHandoff =
  | {
      kind: "resolved";
      to: PlanPlace;
      from: PlanPlace | null;
      intent: PlanTimeIntent;
    }
  | { kind: "seed"; text: string };

/** Handoffs older than this are stale — the rider moved on. */
export const HANDOFF_TTL_MS = 60_000;

export function parseResolvedHandoff(
  raw: string | null | undefined,
  now: number,
): Extract<PlanHandoff, { kind: "resolved" }> | null {
  if (!raw) return null;
  let parsed: {
    from?: PlanPlace | null;
    to?: PlanPlace;
    leaveByISO?: string | null;
    arriveByISO?: string | null;
    at?: number;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed?.to || typeof parsed.at !== "number") return null;
  if (now - parsed.at >= HANDOFF_TTL_MS) return null;
  const intent: PlanTimeIntent = parsed.leaveByISO
    ? { kind: "leaveBy", iso: parsed.leaveByISO }
    : parsed.arriveByISO
      ? { kind: "arriveBy", iso: parsed.arriveByISO }
      : { kind: "now" };
  return { kind: "resolved", to: parsed.to, from: parsed.from ?? null, intent };
}

export function parseSeedHandoff(
  raw: string | null | undefined,
  now: number,
): Extract<PlanHandoff, { kind: "seed" }> | null {
  if (!raw) return null;
  let parsed: { text?: string; at?: number };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const text = parsed?.text?.trim();
  if (!text || typeof parsed.at !== "number") return null;
  if (now - parsed.at > HANDOFF_TTL_MS) return null;
  return { kind: "seed", text };
}

/** "3 OPTIONS · LIVE" — pluralised, uppercased, never "1 OPTIONS". */
export function optionsHeadline(count: number, mode: string): string {
  if (count <= 0) return "NO OPTIONS";
  return `${count} OPTION${count === 1 ? "" : "S"} · ${mode.toUpperCase()}`;
}

/** Label shown in the FROM field, covering every locating state honestly. */
export function originFieldValue(args: {
  useCurrent: boolean;
  hasFix: boolean;
  hasError: boolean;
  pickedLabel?: string | null;
}): string {
  if (args.useCurrent) {
    if (args.hasFix) return "Current location";
    return args.hasError ? "Location unavailable" : "Tap Locate me to use your position";
  }
  return args.pickedLabel?.trim() || "Pick a starting point";
}
