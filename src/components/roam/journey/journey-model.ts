// Pure helpers for multi-leg journeys in the Roam screens: line colour and
// real operator mark per ride, the change blocks between rides, distances,
// stops left on the current ride and the per-leg map geometry.
import { getRoute } from "@/lib/gtfs";
import type { Itinerary, Leg, RideLeg, ViaStop, WalkLeg } from "@/lib/itinerary-types";

export type LatLng = { lat: number; lng: number };

/** Stop names without the feed's stray accent and platform words. */
export function cleanName(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/\s*\u00b4/g, "")
    .replace(/\s+(Alighting|Boarding|Arrivals|Departures)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Short end label for cards: "A, B" or "A - B" reads "A". */
export function shortName(s: string | undefined | null): string {
  return cleanName(s).split(",")[0].split(" - ")[0].trim();
}

export function fmtDist(m: number): string {
  const v = Math.max(0, Math.round(m));
  if (v >= 1000) return `${(v / 1000).toFixed(1)} km`;
  return `${Math.max(10, Math.round(v / 10) * 10)} m`;
}

export function mins(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

export function fmtDur(sec: number): string {
  const m = mins(sec);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export function clock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}

const INK = "#262626";

function feedRoute(routeId: string) {
  return getRoute(routeId) ?? getRoute(routeId.replace(/^\d+:/, ""));
}

export function isKapnos(leg: Pick<RideLeg, "routeId">): boolean {
  return leg.routeId.startsWith("kapnos:");
}

/** The line's own colour from the feed (ink when the feed has none). */
export function legColor(leg: Pick<RideLeg, "routeId">): string {
  if (isKapnos(leg)) return INK;
  const c = feedRoute(leg.routeId)?.color;
  return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : INK;
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Ink or white, whichever reads better on a line colour. */
export function onColor(hex: string): string {
  const l = lum(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (lum("#171717") + 0.05) ? "#ffffff" : "#171717";
}

/** Very light feed colours need an outline to hold up on white. */
export function isPale(hex: string): boolean {
  return lum(hex) > 0.55;
}

/**
 * Real operator mark for a ride, from files already in the repo. Only lines
 * whose own feed name says they are Pame Express get that logo; everything
 * else has no logo (the bus glyph on the line colour is used instead).
 */
export function legLogo(leg: Pick<RideLeg, "routeId" | "routeLong">): {
  src: string;
  alt: string;
  bg: string;
} | null {
  if (isKapnos(leg)) return { src: "/brands/kapnos-mark.png", alt: "Kapnos Airport Shuttle", bg: "#ffffff" };
  if (/pame\s*express/i.test(leg.routeLong ?? "") || /pame\s*express/i.test(feedRoute(leg.routeId)?.long ?? ""))
    return { src: "/brands/pame-express.svg", alt: "Pame Express", bg: "#00427A" };
  return null;
}

/** Where the line is heading: the last place in the feed's long name. */
export function towards(leg: Pick<RideLeg, "routeLong" | "alight">): string {
  const parts = (leg.routeLong ?? "")
    .split(/\s+-\s+|\s+–\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1];
  return cleanName(last && last.length > 2 ? last : leg.alight.name);
}

export type ChangeInfo = {
  /** Ride you get off. */
  from: RideLeg;
  /** Ride you get on next. */
  to: RideLeg;
  /** Same stop (no walk) or a short walk to another stop. */
  sameStop: boolean;
  walkMeters: number;
  walkSec: number;
  waitSec: number;
  /** Index into itinerary.legs of the first leg after `from`. */
  legIndex: number;
};

export type JourneyParts = {
  rides: RideLeg[];
  /** itinerary.legs index of each ride. */
  rideAt: number[];
  access: { meters: number; sec: number; waitSec: number; fromName: string };
  changes: ChangeInfo[];
  egress: { meters: number; sec: number; toName: string };
  walkMeters: number;
  waitSec: number;
};

function sumWalk(legs: Leg[]) {
  let meters = 0;
  let sec = 0;
  let waitSec = 0;
  for (const l of legs) {
    if (l.kind === "walk") {
      meters += l.distanceMeters;
      sec += l.durationSec;
    } else if (l.kind === "wait") waitSec += l.durationSec;
  }
  return { meters, sec, waitSec };
}

export function journeyParts(itin: Pick<Itinerary, "legs">): JourneyParts {
  const legs = itin.legs;
  const rideAt: number[] = [];
  legs.forEach((l, i) => {
    if (l.kind === "ride") rideAt.push(i);
  });
  const rides = rideAt.map((i) => legs[i] as RideLeg);
  const first = rideAt[0] ?? legs.length;
  const last = rideAt[rideAt.length - 1] ?? -1;
  const pre = legs.slice(0, first);
  const post = legs.slice(last + 1);
  const a = sumWalk(pre);
  const e = sumWalk(post);
  const firstWalk = pre.find((l): l is WalkLeg => l.kind === "walk");
  const lastWalk = [...post].reverse().find((l): l is WalkLeg => l.kind === "walk");
  const changes: ChangeInfo[] = [];
  let waitTotal = a.waitSec;
  for (let k = 0; k + 1 < rideAt.length; k++) {
    const between = legs.slice(rideAt[k] + 1, rideAt[k + 1]);
    const s = sumWalk(between);
    const from = rides[k];
    const to = rides[k + 1];
    const sameStop =
      from.alight.stopId === to.board.stopId ||
      cleanName(from.alight.name) === cleanName(to.board.name) ||
      s.meters < 25;
    // Wait = the gap at the stop; when the planner gave no wait leg, use the
    // timetable gap minus the walk so the number is never invented.
    const gap = to.board.departureUnix - from.alight.arrivalUnix;
    const waitSec = s.waitSec > 0 ? s.waitSec : Math.max(0, gap - s.sec);
    waitTotal += waitSec;
    changes.push({
      from,
      to,
      sameStop,
      walkMeters: s.meters,
      walkSec: s.sec,
      waitSec,
      legIndex: rideAt[k] + 1,
    });
  }
  return {
    rides,
    rideAt,
    access: {
      meters: a.meters,
      sec: a.sec,
      waitSec: a.waitSec,
      fromName: cleanName(firstWalk?.from.name ?? rides[0]?.board.name),
    },
    changes,
    egress: {
      meters: e.meters,
      sec: e.sec,
      toName: cleanName(lastWalk?.to.name ?? rides[rides.length - 1]?.alight.name),
    },
    walkMeters: a.meters + e.meters + changes.reduce((n, c) => n + c.walkMeters, 0),
    waitSec: waitTotal,
  };
}

/** Board, every intermediate stop, alight: the calls of one ride in order. */
export function rideCalls(leg: RideLeg): (ViaStop & { kind: "board" | "via" | "alight" })[] {
  return [
    { ...leg.board, arrivalUnix: leg.board.departureUnix, kind: "board" as const },
    ...(leg.via ?? []).map((v) => ({ ...v, kind: "via" as const })),
    { ...leg.alight, kind: "alight" as const },
  ];
}

function distM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Stops left before getting off (the alight stop counts as one). Uses the
 * bus position when known (nearest call within 400 m), otherwise the
 * timetable times shifted by the known delay. Null when the plan has no
 * stop list for this ride.
 */
export function stopsLeft(
  leg: RideLeg,
  nowUnix: number,
  vehicle?: LatLng | null,
): number | null {
  if (!leg.via) return null;
  const calls = rideCalls(leg);
  if (vehicle) {
    let best = -1;
    let bestD = Infinity;
    calls.forEach((c, i) => {
      const d = distM(vehicle, c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0 && bestD < 400) return Math.max(1, calls.length - 1 - best);
  }
  const delay = leg.delaySec || 0;
  const left = calls.slice(1).filter((c) => c.arrivalUnix + delay > nowUnix).length;
  return Math.max(1, left);
}

export type MapSegment = { kind: "ride" | "walk"; color: string; coords: LatLng[] };

function decode(str: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: LatLng[] = [];
  while (index < str.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index < str.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

function sliceShape(shape: LatLng[], a: LatLng, b: LatLng): LatLng[] | null {
  let ia = -1;
  let da = Infinity;
  shape.forEach((p, i) => {
    const d = distM(p, a);
    if (d < da) {
      da = d;
      ia = i;
    }
  });
  let ib = -1;
  let db = Infinity;
  for (let i = Math.max(0, ia); i < shape.length; i++) {
    const d = distM(shape[i], b);
    if (d < db) {
      db = d;
      ib = i;
    }
  }
  if (ia < 0 || ib <= ia || da > 250 || db > 250) return null;
  return [a, ...shape.slice(ia, ib + 1), b];
}

/**
 * One map segment per leg: rides in their line colour along the real road
 * shape when it is known (else through every stop the bus calls at), walks
 * as their own path or a straight hop.
 */
export function journeySegments(
  itin: Pick<Itinerary, "legs">,
  shapeFor?: (tripId: string, routeId: string) => LatLng[] | null,
): MapSegment[] {
  const out: MapSegment[] = [];
  for (const leg of itin.legs) {
    if (leg.kind === "walk") {
      if (leg.distanceMeters < 15) continue;
      const path = leg.polyline ? decode(leg.polyline) : [];
      out.push({
        kind: "walk",
        color: "#ffffff",
        coords: path.length >= 2 ? path : [leg.from, leg.to],
      });
    } else if (leg.kind === "ride") {
      const shape = shapeFor?.(leg.tripId, leg.routeId) ?? null;
      const sliced = shape ? sliceShape(shape, leg.board, leg.alight) : null;
      out.push({
        kind: "ride",
        color: legColor(leg),
        coords: sliced ?? rideCalls(leg).map((c) => ({ lat: c.lat, lng: c.lng })),
      });
    }
  }
  return out;
}
