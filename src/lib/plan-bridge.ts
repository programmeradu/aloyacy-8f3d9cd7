/**
 * Pure planning helpers extracted from the /trips screen.
 *
 * Everything here is deterministic and free of React, browser globals and
 * network access, so it is directly unit-testable and shared by the route,
 * its sub-components and the planning hooks.
 */
import { cyClock, cyDayDiff } from "@aloya/core/cy-time";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import type { JourneyOption } from "@/lib/journey.server";
import type { Point, TimeIntent } from "@/lib/plan-types";

/**
 * Map a single-ride Itinerary into the legacy JourneyOption shape that
 * trip.$id and trip-store still expect. Wait legs are dropped — the companion
 * derives waiting from the board time.
 */
export function itineraryToJourneyOption(it: Itinerary): JourneyOption | null {
  const ride = it.legs.find((l): l is RideLeg => l.kind === "ride");
  if (!ride) return null;
  const legs: JourneyOption["legs"] = [];
  for (const leg of it.legs) {
    if (leg.kind === "walk") {
      const w = leg as WalkLeg;
      legs.push({
        kind: "walk",
        from: { lat: w.from.lat, lng: w.from.lng, label: w.from.name },
        to: { lat: w.to.lat, lng: w.to.lng, label: w.to.name },
        durationSec: w.durationSec,
        distanceMeters: w.distanceMeters,
      });
    } else if (leg.kind === "ride") {
      legs.push({
        kind: "bus",
        routeId: leg.routeId,
        routeShort: leg.routeShort,
        routeLong: leg.routeLong,
        tripId: leg.tripId,
        board: {
          stopId: leg.board.stopId,
          name: leg.board.name,
          departureUnix: leg.board.departureUnix,
        },
        alight: {
          stopId: leg.alight.stopId,
          name: leg.alight.name,
          arrivalUnix: leg.alight.arrivalUnix,
        },
        delaySec: leg.delaySec,
        scheduled: !leg.live,
      });
    }
  }
  return {
    id: it.id,
    totalDurationSec: it.totalDurationSec,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    legs,
    transfers: it.transfers,
    scheduled: it.source !== "live",
  };
}

/** True when the itinerary is a single-ride trip (legacy companion path). */
export function isSingleRide(it: Itinerary): boolean {
  return it.legs.filter((l) => l.kind === "ride").length === 1;
}

/** Split results into free direct trips and Pro-gated transfer trips. */
export function splitItineraries(results: Itinerary[]): {
  direct: Itinerary[];
  transfers: Itinerary[];
} {
  return {
    direct: results.filter((it) => it.transfers === 0),
    transfers: results.filter((it) => it.transfers > 0),
  };
}

/** Access (first) walk distance in metres for the bus-only baseline. */
export function accessWalkMeters(it: Itinerary | null): number | null {
  if (!it) return null;
  const firstWalk = it.legs.find((l) => l.kind === "walk");
  return firstWalk && firstWalk.kind === "walk" ? Math.round(firstWalk.distanceMeters) : 0;
}

/**
 * Final (egress) walk of an itinerary — only counted when it follows a ride,
 * which is what makes a last-mile taxi handoff meaningful.
 */
export function finalWalkInfo(it: Itinerary | null): {
  walkMeters: number;
  alight: { lat: number; lng: number; name: string };
} | null {
  if (!it) return null;
  const legs = it.legs;
  for (let i = legs.length - 1; i >= 0; i--) {
    const l = legs[i];
    if (l.kind === "walk") {
      const wl = l as WalkLeg;
      const hasPriorRide = legs.slice(0, i).some((p) => p.kind === "ride");
      if (!hasPriorRide) return null;
      return {
        walkMeters: Math.round(wl.distanceMeters),
        alight: { lat: wl.from.lat, lng: wl.from.lng, name: wl.from.name },
      };
    }
  }
  return null;
}

/** Sample points (board/alight + walk endpoints) used for traffic overlays. */
export function trafficPoints(it: Itinerary | null): Array<{ lat: number; lng: number }> {
  if (!it) return [];
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const l of it.legs) {
    if (l.kind === "ride") {
      pts.push({ lat: l.board.lat, lng: l.board.lng });
      pts.push({ lat: l.alight.lat, lng: l.alight.lng });
    } else if (l.kind === "walk") {
      pts.push({ lat: l.from.lat, lng: l.from.lng });
      pts.push({ lat: l.to.lat, lng: l.to.lng });
    }
  }
  return pts;
}

/** Stable query-key fragment for a list of traffic sample points. */
export function trafficKey(points: Array<{ lat: number; lng: number }>): string {
  return points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|");
}

/**
 * Convert Kapnos "YYYY-MM-DD HH:mm:ss" (Cyprus local wall-clock) to unix
 * seconds. Resolves the Asia/Nicosia offset for that specific date through
 * Intl so DST is handled without hardcoding +2/+3.
 */
export function cyprusLocalToUnix(local: string): number | undefined {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return undefined;
  const Y = +m[1],
    Mo = +m[2],
    D = +m[3],
    H = +m[4],
    Mi = +m[5],
    S = +(m[6] ?? 0);
  const guess = Date.UTC(Y, Mo - 1, D, H, Mi, S);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Nicosia",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(guess));
  const get = (t: string) => +parts.find((p) => p.type === t)!.value;
  const asCy = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offset = asCy - guess; // ms Cyprus is ahead of UTC
  return Math.floor((guess - offset) / 1000);
}

export type PlanDeepLink = {
  origin: Point | null;
  destination: Point | null;
  timeIntent: TimeIntent | null;
  /** Which field to open the picker on once hydrated. */
  focus: "from" | null;
  /** False when the URL carried no usable plan and should be left alone. */
  matched: boolean;
};

const NO_DEEP_LINK: PlanDeepLink = {
  origin: null,
  destination: null,
  timeIntent: null,
  focus: null,
  matched: false,
};

/**
 * Parse a "/plan/:token → Open this plan in Aloya" deep link.
 *
 * Accepts both endpoints (full plan) or a destination only (group page).
 * A departure more than a minute in the past is ignored: replanning from
 * "now" is kinder than returning an empty result for a stale link.
 */
export function parsePlanDeepLink(search: string, now: number = Date.now()): PlanDeepLink {
  const sp = new URLSearchParams(search);
  const fromLat = parseFloat(sp.get("fromLat") ?? "");
  const fromLng = parseFloat(sp.get("fromLng") ?? "");
  const toLat = parseFloat(sp.get("toLat") ?? "");
  const toLng = parseFloat(sp.get("toLng") ?? "");
  const fromLabel = sp.get("fromLabel") ?? "";
  const toLabel = sp.get("toLabel") ?? "";
  const hasFrom = Number.isFinite(fromLat) && Number.isFinite(fromLng) && !!fromLabel;
  const hasTo = Number.isFinite(toLat) && Number.isFinite(toLng) && !!toLabel;

  if (hasFrom && hasTo) {
    const dep = parseInt(sp.get("dep") ?? "", 10);
    const depFresh = Number.isFinite(dep) && dep > 0 && dep * 1000 > now - 60_000;
    return {
      origin: { lat: fromLat, lng: fromLng, label: fromLabel },
      destination: { lat: toLat, lng: toLng, label: toLabel },
      timeIntent: depFresh
        ? { leaveByISO: new Date(dep * 1000).toISOString(), arriveByISO: null }
        : null,
      focus: null,
      matched: true,
    };
  }
  if (hasTo) {
    return {
      origin: null,
      destination: { lat: toLat, lng: toLng, label: toLabel },
      timeIntent: null,
      focus: "from",
      matched: true,
    };
  }
  return NO_DEEP_LINK;
}

/** Render "20250314" as a readable date; passes anything else through. */
export function formatYYYYMMDD(s: string): string {
  if (!/^\d{8}$/.test(s)) return s;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  try {
    return new Date(Date.UTC(y, m, d)).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

/**
 * Time-of-day label for a leave-by / arrive-by chip. Today shows the bare
 * time, tomorrow is spelled out, anything further gets a weekday prefix.
 */
export function formatIntentLabel(
  iso: string,
  // Narrow key type keeps this assignable from the app's typed `t`.
  t: (key: "trips.intentTomorrow", vars?: Record<string, string | number>) => string,
  now: Date = new Date(),
): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // Always Cyprus time — the label must match what the buses run on.
    const time = cyClock(d.getTime());
    const diff = cyDayDiff(now.getTime(), d.getTime());
    if (diff <= 0) return time;
    if (diff === 1) return t("trips.intentTomorrow", { time });
    const day = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone: "Asia/Nicosia",
    }).format(d);
    return `${day} ${time}`;
  } catch {
    return iso;
  }
}

/**
 * Suggestion labels come from Places and can be very long. Trim to the first
 * clause and scale the type down so two lines always fit the card.
 */
export function suggestionLabel(raw: string): { text: string; sizeClass: string } {
  const text = raw.split(/[,—-]/)[0].trim();
  const len = text.length;
  const sizeClass =
    len > 38 ? "text-[13px]" : len > 28 ? "text-[15px]" : len > 20 ? "text-[16px]" : "text-[18px]";
  return { text, sizeClass };
}
