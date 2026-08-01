// Shared-plan viewer logic — the read-only page a friend opens from a link.
//
// Pure so the web route and the native screen phrase everything identically:
// clock/date/duration formatting, per-leg copy, where the group meets, the
// change count, and how long the link stays alive.

export type PlanShareLeg = {
  kind?: "ride" | "walk" | "wait";
  routeShort?: string;
  routeId?: string;
  board?: { name?: string; departureUnix?: number };
  alight?: { name?: string; arrivalUnix?: number };
  from?: { name?: string };
  to?: { name?: string };
  name?: string;
  durationSec?: number;
  stopCount?: number;
};

export type PlanShare = {
  token: string;
  creator_name: string | null;
  note: string | null;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  departure_unix: number;
  arrival_unix: number;
  total_duration_sec: number;
  transfers: number;
  legs: PlanShareLeg[];
  created_at: string;
  expires_at: string;
};

export function planClock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function planDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function planDuration(sec: number): string {
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h} h` : `${h} h ${rem}`;
}

export function changesLabel(transfers: number): string {
  if (transfers <= 0) return "No changes";
  return transfers === 1 ? "1 change" : `${transfers} changes`;
}

export type LegCopy = {
  kind: "ride" | "walk" | "wait";
  badge: string;
  title: string;
  /** Only rides carry an alight line. */
  subtitle: string | null;
  /** "08:14 → 08:41", a duration, a lone departure, or "". */
  timing: string;
};

export function legCopy(leg: PlanShareLeg): LegCopy {
  const kind = leg.kind ?? "ride";
  const fromName = leg.board?.name ?? leg.from?.name ?? leg.name ?? "—";
  const toName = leg.alight?.name ?? leg.to?.name ?? "";
  const depart = leg.board?.departureUnix ? planClock(leg.board.departureUnix) : null;
  const arrive = leg.alight?.arrivalUnix ? planClock(leg.alight.arrivalUnix) : null;

  const badge = kind === "ride" ? (leg.routeShort ?? "Bus") : kind === "walk" ? "Walk" : "Wait";
  const title =
    kind === "ride"
      ? `Board at ${fromName}`
      : kind === "walk"
        ? `Walk to ${toName || fromName}`
        : fromName;
  const subtitle = kind === "ride" && toName ? `Off at ${toName}` : null;
  const timing =
    depart && arrive
      ? `${depart} → ${arrive}`
      : leg.durationSec
        ? planDuration(leg.durationSec)
        : (depart ?? "");

  return { kind, badge, title, subtitle, timing };
}

/** Where the group gathers: the first ride's boarding stop, else the origin. */
export function meetPoint(plan: PlanShare): { name: string; unix: number } {
  const firstRide = plan.legs.find((l) => (l.kind ?? "ride") === "ride");
  return {
    name: firstRide?.board?.name ?? plan.origin_label,
    unix: firstRide?.board?.departureUnix ?? plan.departure_unix,
  };
}

export function expiryLabel(expiresAt: string, nowMs = Date.now()): string {
  const diffH = (new Date(expiresAt).getTime() - nowMs) / 3600_000;
  if (!Number.isFinite(diffH) || diffH <= 0) return "This link has expired.";
  if (diffH < 1) return "This link expires within the hour.";
  if (diffH < 24) return `This link expires in about ${Math.round(diffH)} hours.`;
  return `This link expires in ${Math.round(diffH / 24)} days.`;
}

/** Message body for the native/web share sheet. */
export function planShareMessage(plan: PlanShare | null, url: string): string {
  if (!plan) return url;
  return `Aloya plan — ${plan.origin_label} → ${plan.destination_label} — ${planDate(
    plan.departure_unix,
  )} ${planClock(plan.departure_unix)}\n${url}`;
}
