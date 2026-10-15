// Pure state logic for the Sky Clock home (Explore). No React, no network:
// everything here is derived from inputs so it can be unit tested.

import type { DictKey } from "@/lib/i18n";
import type { FreshnessTier } from "@aloya/core/freshness";

/** How much the ETA is backed by realtime data. */
export type Backing = "live" | "estimated" | "scheduled";

export type NextBus = {
  stopId: string;
  stopName: string;
  /** Rounded walking minutes from the rider to the stop (null for a picked stop with no GPS). */
  walkMin: number | null;
  walkSec: number;
  stopLat: number;
  stopLng: number;
  tripId: string;
  routeId: string;
  line: string;
  /** Route colour from routes.json, with leading "#". */
  color: string;
  dest: string;
  via: string | null;
  etaMin: number;
  arrivalUnix: number;
  backing: Backing;
  /** Stops between the bus and the rider's stop, only when a live vehicle backs it. */
  stopsAway: number | null;
  /** Later arrivals of the same line + direction at this stop (unix seconds). */
  then: number[];
  /** Where the times came from: the realtime snapshot or the offline timetable. */
  source: "realtime" | "offline";
};

export type NearbyLine = {
  stopId: string;
  routeId: string;
  line: string;
  color: string;
  dest: string;
  etaMin: number;
  live: boolean;
};

export type CardState =
  | { kind: "loading" }
  | { kind: "no-location"; denied: boolean }
  | { kind: "bus"; bus: NextBus }
  | { kind: "none"; stopId: string | null; stopName: string | null }
  | { kind: "error" };

export type CardInput = {
  mounted: boolean;
  /** A stop the rider picked by hand overrides GPS. */
  hasPickedStop: boolean;
  geoSource: "live" | "cached" | "fallback";
  geoLoading: boolean;
  geoDenied: boolean;
  rtLoading: boolean;
  rtError: boolean;
  rtHasData: boolean;
  offlineLoading: boolean;
  bus: NextBus | null;
  nearestStop: { id: string; name: string } | null;
};

/** Decide which designed card to show. Order matters: real data first. */
export function deriveCardState(i: CardInput): CardState {
  if (!i.mounted) return { kind: "loading" };
  const located = i.hasPickedStop || i.geoSource !== "fallback";
  if (!located) {
    if (i.geoLoading) return { kind: "loading" };
    return { kind: "no-location", denied: i.geoDenied };
  }
  if (i.bus) return { kind: "bus", bus: i.bus };
  if (i.rtLoading && !i.rtHasData) return { kind: "loading" };
  if (i.offlineLoading) return { kind: "loading" };
  if (i.rtError && !i.rtHasData) return { kind: "error" };
  return {
    kind: "none",
    stopId: i.nearestStop?.id ?? null,
    stopName: i.nearestStop?.name ?? null,
  };
}

/** Headline under the greeting. "Your bus is close" only when it is live and under 10 min. */
export function headline(
  s: CardState,
  fmtTime: (unix: number) => string,
): { key: DictKey; vars?: Record<string, string | number> } {
  switch (s.kind) {
    case "loading":
      return { key: "sky.head.loading" };
    case "no-location":
      return { key: "sky.head.where" };
    case "error":
      return { key: "sky.head.error" };
    case "none":
      return { key: "sky.head.quiet" };
    case "bus": {
      const b = s.bus;
      if (b.etaMin < 10) return { key: b.backing === "live" ? "sky.head.close" : "sky.head.dueSoon" };
      if (b.etaMin <= 30) return { key: "sky.head.inMin", vars: { n: b.etaMin } };
      return { key: "sky.head.at", vars: { time: fmtTime(b.arrivalUnix) } };
    }
  }
}

/** Map the shared freshness classifier onto the three badges the card can show. */
export function backingFor(tier: FreshnessTier | undefined): Backing {
  if (tier === "live" || tier === "rider-confirmed") return "live";
  if (tier === "predicted") return "estimated";
  return "scheduled";
}

/** Walking time to a stop: straight line × 1.25 detour at 80 m/min, at least 1 min. */
export function walkMinutes(distanceKm: number): number {
  return Math.max(1, Math.ceil((distanceKm * 1000 * 1.25) / 80));
}

/** Greeting word key by hour (Cyprus usage: Kaliméra until noon, Kalispéra after), holidays first. */
export function greetingKey(d: Date): DictKey {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 1 && day === 1) return "sky.greet.newYear";
  if (m === 1 && day === 6) return "sky.greet.epiphany";
  if ((m === 3 && day === 25) || (m === 4 && day === 1) || (m === 8 && day === 15)) return "sky.greet.chroniaPolla";
  if ((m === 10 && day === 1) || (m === 10 && day === 28)) return "sky.greet.chroniaPolla";
  if (m === 12 && day >= 24 && day <= 26) return "sky.greet.christmas";
  if (m === 12 && day === 31) return "sky.greet.newYearsEve";
  if (isOrthodoxEasterWindow(d)) return "sky.greet.easter";
  const h = d.getHours();
  return h >= 4 && h < 12 ? "sky.greet.morning" : "sky.greet.evening";
}

function isOrthodoxEasterWindow(now: Date): boolean {
  const year = now.getFullYear();
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const g = new Date(Date.UTC(year, month - 1, day));
  g.setUTCDate(g.getUTCDate() + 13);
  const easter = new Date(year, g.getUTCMonth(), g.getUTCDate());
  const diff = Math.round((new Date(year, now.getMonth(), now.getDate()).getTime() - easter.getTime()) / 86_400_000);
  return diff >= -1 && diff <= 1;
}

export function timeOfDayKey(d: Date): DictKey {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "sky.tod.morning";
  if (h >= 12 && h < 17) return "sky.tod.afternoon";
  if (h >= 17 && h < 22) return "sky.tod.evening";
  return "sky.tod.night";
}

export function conditionKey(icon: "sun" | "cloud" | "rain" | "storm" | "wind" | "moon"): DictKey {
  if (icon === "cloud") return "sky.cond.cloud";
  if (icon === "rain") return "sky.cond.rain";
  if (icon === "storm") return "sky.cond.storm";
  if (icon === "wind") return "sky.cond.wind";
  return "sky.cond.clear";
}

/**
 * Which departure the "Remind me" button targets. The reminder fires 5 min
 * before the rider must start walking (same rule as the Trips RemindMeButton),
 * so it only makes sense when that moment is still at least a minute away.
 * Returns null when no listed departure can still be reminded about.
 */
export function remindTarget(
  bus: Pick<NextBus, "arrivalUnix" | "then" | "walkSec">,
  nowSec: number,
): { arrivalUnix: number; remindAtUnix: number; isNext: boolean } | null {
  const all = [bus.arrivalUnix, ...bus.then];
  for (let i = 0; i < all.length; i++) {
    const remindAtUnix = all[i] - bus.walkSec - 5 * 60;
    if (remindAtUnix >= nowSec + 60) return { arrivalUnix: all[i], remindAtUnix, isNext: i === 0 };
  }
  return null;
}

/** Text colour for a line badge so light route colours stay readable. */
export function badgeInk(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#1A1830" : "#fff";
}

/**
 * "via" line from the route's published long name ("A - B - C - D"): the
 * middle stop names that are not the destination. Null when the name has no
 * intermediate points, so the card never invents one.
 */
export function viaFromLongName(longName: string | undefined, dest: string): string | null {
  if (!longName) return null;
  const parts = longName
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const d = dest.toLowerCase();
  const mids = parts.slice(1, -1).filter((p) => !d.includes(p.toLowerCase()) && !p.toLowerCase().includes(d));
  if (mids.length === 0) return null;
  return mids.slice(0, 2).join(", ");
}

/** "7:54" in Cyprus time, regardless of the device clock's zone. */
export function fmtCyprusTime(unix: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Nicosia",
  }).formatToParts(new Date(unix * 1000));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}
