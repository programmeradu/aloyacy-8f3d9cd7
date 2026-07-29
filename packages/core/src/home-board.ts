// Pure logic behind the home ("Today") screen board: nearest-stop selection,
// arrival grouping, route chip derivation, network on-time share, and the
// small copy helpers the omni-search rows need. No React, no network — every
// input is handed in, so web and mobile stay locked to identical behaviour.
import { distanceM, type LatLng } from "./geo";
import type { SearchResult } from "./home-search";

export type BoardStop = {
  id: string;
  code: string;
  name: string;
  agency: string;
  lat: number;
  lng: number;
};

export type BoardArrival = {
  stopId: string;
  routeId: string;
  tripId: string;
  arrivalUnix: number;
  delaySec: number;
};

export type BoardRouteMeta = { short: string; long?: string; color?: string };

export type StopArrival = { routeId: string; tripId: string; etaMin: number };

export type RouteChipish = {
  code: string;
  tone: RouteTone;
  color?: string;
  headsign?: string | null;
};

export type RouteTone = "aegean" | "ochre" | "olive";

/**
 * Deterministic tone for a route id so the same line always renders with the
 * same accent across sessions, screens, and platforms.
 */
export function toneForRoute(id: string): RouteTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const v = Math.abs(h) % 3;
  return v === 0 ? "aegean" : v === 1 ? "ochre" : "olive";
}

/**
 * Human area label derived from a stop name ("Makariou Ave · Nicosia" →
 * "Makariou Ave"). Falls back to the island name when nothing is known.
 */
export function areaFromStop(stop?: { name?: string | null } | null, fallback = "Cyprus"): string {
  const name = stop?.name?.trim();
  if (!name) return fallback;
  return name.split(/[·\-,]/)[0]!.trim() || fallback;
}

/** Nearest `limit` stops to `here`, each annotated with its distance in metres. */
export function nearestStops<T extends { lat: number; lng: number }>(
  here: LatLng,
  stops: readonly T[],
  limit = 6,
): (T & { d: number })[] {
  return stops
    .map((s) => ({ ...s, d: distanceM(here, { lat: s.lat, lng: s.lng }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, limit));
}

/**
 * Bucket predicted arrivals by stop, converted to whole minutes from now and
 * clipped to a sane horizon. Each bucket is sorted soonest-first.
 */
export function groupArrivalsByStop(
  arrivals: readonly BoardArrival[],
  nowSec: number,
  horizonMin = 120,
): Map<string, StopArrival[]> {
  const byStop = new Map<string, StopArrival[]>();
  for (const a of arrivals) {
    const etaMin = Math.max(0, Math.round((a.arrivalUnix - nowSec) / 60));
    if (etaMin > horizonMin) continue;
    const list = byStop.get(a.stopId);
    const entry: StopArrival = { routeId: a.routeId, tripId: a.tripId, etaMin };
    if (list) list.push(entry);
    else byStop.set(a.stopId, [entry]);
  }
  for (const list of byStop.values()) list.sort((a, b) => a.etaMin - b.etaMin);
  return byStop;
}

/**
 * Up to `limit` distinct route chips for a stop, in arrival order. Returns a
 * single placeholder chip when nothing is predicted, so the card never
 * collapses to an empty row.
 */
export function routeChipsForStop(
  arrivals: readonly StopArrival[],
  routes: Record<string, BoardRouteMeta | undefined>,
  headsignFor: (tripId: string, routeId: string) => string | null,
  limit = 3,
): RouteChipish[] {
  const seen = new Set<string>();
  const chips: RouteChipish[] = [];
  for (const a of arrivals) {
    if (seen.has(a.routeId)) continue;
    seen.add(a.routeId);
    const meta = routes[a.routeId];
    chips.push({
      code: meta?.short ?? a.routeId,
      tone: toneForRoute(a.routeId),
      color: meta?.color,
      headsign: headsignFor(a.tripId, a.routeId),
    });
    if (chips.length >= limit) break;
  }
  if (chips.length === 0) chips.push({ code: "—", tone: "olive", headsign: null });
  return chips;
}

/**
 * Share of sampled arrivals running within `toleranceSec` of schedule, as a
 * whole percentage. Null when there is nothing to sample.
 */
export function onTimePercent(
  arrivals: readonly { delaySec: number }[],
  toleranceSec = 120,
  sampleSize = 400,
): number | null {
  const sampled = arrivals.slice(0, sampleSize);
  if (sampled.length === 0) return null;
  const ok = sampled.filter((a) => Math.abs(a.delaySec) <= toleranceSec).length;
  return Math.round((ok / sampled.length) * 100);
}

/**
 * Cyprus international airports, mirrored from the server airport module so
 * client search can surface them without pulling the whole module.
 */
export const CY_AIRPORTS = [
  {
    code: "lca",
    iata: "LCA",
    name: "Larnaca International Airport",
    nameEl: "Διεθνές Αεροδρόμιο Λάρνακας",
    city: "Larnaca",
    cityEl: "Λάρνακα",
  },
  {
    code: "pfo",
    iata: "PFO",
    name: "Paphos International Airport",
    nameEl: "Διεθνές Αεροδρόμιο Πάφου",
    city: "Paphos",
    cityEl: "Πάφος",
  },
] as const;

/** In-app route for a search hit. */
export function searchResultHref(hit: SearchResult): string {
  switch (hit.kind) {
    case "stop":
      return `/stop/${hit.id}`;
    case "route":
      return `/route/${hit.id}`;
    case "vehicle":
      return `/trip/${hit.tripId}`;
    case "airport":
      return `/airport/${hit.id}`;
  }
}

/** Uppercase kind badge shown on a search row. */
export function searchResultBadge(hit: SearchResult): string {
  switch (hit.kind) {
    case "stop":
      return "STOP";
    case "route":
      return "ROUTE";
    case "vehicle":
      return "LIVE BUS";
    case "airport":
      return "AIRPORT";
  }
}

/** Primary + secondary line for a search row, shared by web and mobile. */
export function searchResultCopy(hit: SearchResult): { primary: string; meta: string } {
  switch (hit.kind) {
    case "stop":
      return { primary: hit.name, meta: hit.sub };
    case "route":
      return {
        primary: `Route ${hit.code}`,
        meta: hit.liveCount > 0 ? `${hit.city}  ${hit.liveCount} live` : hit.city,
      };
    case "vehicle":
      return { primary: hit.label, meta: `Route ${hit.routeCode}  ${hit.sub}` };
    case "airport":
      return { primary: hit.name, meta: `${hit.iata}  ${hit.city}` };
  }
}
