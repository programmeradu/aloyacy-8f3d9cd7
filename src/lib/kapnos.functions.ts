// Wave 3 — Kapnos Airport Shuttle layer.
//
// Kapnos runs Cyprus's only scheduled airport coach network: Larnaca (LCA)
// and Paphos (PFO) airports ↔ Nicosia, Paphos, Larnaca city, Agia Napa,
// Protaras. Cyprus Public Transport buses don't serve the airports
// well — Kapnos is what locals actually use. We surface it as a first-
// class alternative whenever one trip endpoint is at an airport.
//
// Data source: the live booking API behind kapnosairportshuttle.com
// (kapnos.ecoachmanager.com), `/coachtrip/api/trip-type-all`. It returns
// every active route with its pickup/dropoff coordinates and the next
// ~60 scheduled departures per route, including seat availability.
//
// Honesty rules:
//   • Only suggest when one endpoint is within MAX_AIRPORT_WALK_M of an
//     airport stop AND the other within MAX_CITY_WALK_M of a city stop
//     on the SAME route (direction-aware).
//   • Departures already gone are filtered out (Cyprus local time).
//   • Show seat availability as-is; never round up.
//   • Deep-link to Kapnos's own booking flow — we don't transact.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { distanceM } from "./geo";

const FEED_URL =
  "https://kapnos.ecoachmanager.com/coachtrip/api/trip-type-all";

const MAX_AIRPORT_WALK_M = 3_000; // airports are large; 3 km covers terminal+forecourt
// Kapnos has only ONE coach stop per city (Nicosia/Larnaca/Paphos/Ayia Napa),
// so the "city walk" is really "how far the rider is from that single coach
// stop". Tight radii (≤3 km) miss most real trips — Nicosia alone spans
// 8–10 km end-to-end. We use a city catchment that covers the whole urban
// area; the card itself shows the walking distance so the rider can decide
// whether to bus/taxi to the coach stop.
const MAX_CITY_WALK_M = 10_000;
const SUGGEST_COUNT = 3;          // next N departures

const CACHE_TTL_MS = 10 * 60_000;
let cache: { at: number; data: KapnosRoute[] } | null = null;

export type KapnosStop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isAirport: boolean;
  /** Cumulative time from route start, "HH:MM:SS" — dropoffs only. */
  rangeFromStart?: string;
};

export type KapnosDeparture = {
  tripId: string;
  /** Local Cyprus departure, "YYYY-MM-DD HH:MM:SS". */
  departLocal: string;
  /** Local Cyprus arrival, "YYYY-MM-DD HH:MM:SS". */
  arriveLocal: string;
  seatsAvailable: number;
  priceFrom: string;
};

export type KapnosRoute = {
  id: string;
  code: string;           // "1AT000"
  name: string;           // "LARNACA > NICOSIA"
  pickups: KapnosStop[];
  dropoffs: KapnosStop[];
  trips: Array<{
    tripId: string;
    /** "YYYY-MM-DD HH:MM:SS" Cyprus local */
    departLocal: string;
    seatsAvailable: number;
    priceFromRaw: string;
    priceFromFormatted: string;
  }>;
};

function parseRangeToSec(r: string | undefined): number {
  if (!r) return 0;
  const [h, m, s] = r.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 3600 + m * 60 + s;
}

function addLocalSeconds(local: string, addSec: number): string {
  // local is "YYYY-MM-DD HH:MM:SS" Cyprus time. We treat it as an opaque
  // wall-clock and add seconds without TZ math — safe because addSec is
  // short (route durations < 5 h) and we never cross a DST boundary mid-
  // route in Cyprus (DST flips at 03:00–04:00, no coaches running).
  const [date, time] = local.split(" ");
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const [h, m, s] = time.split(":").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(Y, M - 1, D, h, m, s));
  d.setUTCSeconds(d.getUTCSeconds() + addSec);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
    d.getUTCDate(),
  )} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
}

function nowCyprusLocal(): string {
  // Stable "sv-SE" format gives us "YYYY-MM-DD HH:MM:SS" directly.
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date()).replace("T", " ");
}

function isAirportPoint(name: string): boolean {
  return /airport|\(A\d/i.test(name);
}

export async function fetchKapnosRoutes(): Promise<KapnosRoute[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const res = await fetch(FEED_URL, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`kapnos ${res.status}`);
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const parsed: KapnosRoute[] = [];
    for (const r of raw) {
      const id = String(r.trip_type_id ?? "");
      const fullName = String(r.trip_type_name ?? "");
      // "1AT000 - LARNACA > NICOSIA"
      const [code, ...rest] = fullName.split(" - ");
      const name = rest.join(" - ") || fullName;
      const loc = (r.trip_type_location ?? {}) as Record<string, unknown>;
      const pickupsRaw = (loc.pickup ?? []) as Array<Record<string, string>>;
      const dropoffsRaw = (loc.dropoff ?? []) as Array<Record<string, string>>;
      const pickups: KapnosStop[] = pickupsRaw
        .map((p) => ({
          id: String(p.point_id),
          name: String(p.point_name ?? ""),
          lat: Number(p.point_lat),
          lng: Number(p.point_lng),
          isAirport: isAirportPoint(String(p.point_name ?? "")),
        }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      const dropoffs: KapnosStop[] = dropoffsRaw
        .map((p) => ({
          id: String(p.drop_id),
          name: String(p.drop_name ?? ""),
          lat: Number(p.drop_lat),
          lng: Number(p.drop_lng),
          isAirport: isAirportPoint(String(p.drop_name ?? "")),
          rangeFromStart: String(p.drop_range ?? ""),
        }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
      const tripListRaw =
        ((r.trip_type_trips as Record<string, unknown> | undefined)
          ?.tripList as Array<Record<string, unknown>> | undefined) ?? [];
      const trips = tripListRaw.map((t) => ({
        tripId: String(t.trip_id ?? ""),
        departLocal: String(t.trip_datetime ?? ""),
        seatsAvailable: Number(t.seat_available ?? 0),
        priceFromRaw: String(t.trip_prices && Array.isArray(t.trip_prices) && t.trip_prices[0]
          ? (t.trip_prices[0] as Record<string, unknown>).price ?? ""
          : ""),
        priceFromFormatted: String(t.trip_prices && Array.isArray(t.trip_prices) && t.trip_prices[0]
          ? (t.trip_prices[0] as Record<string, unknown>).price_formatted ?? ""
          : String(r.trip_price_default ?? "")),
      }));
      parsed.push({ id, code: code ?? id, name, pickups, dropoffs, trips });
    }
    cache = { at: now, data: parsed };
    return parsed;
  } catch (err) {
    if (cache) return cache.data; // serve stale rather than break the page
    console.error("[kapnos] feed fetch failed:", err);
    return [];
  }
}

export type KapnosSuggestion = {
  routeId: string;
  routeCode: string;
  routeName: string;
  pickup: { name: string; lat: number; lng: number; distanceM: number };
  dropoff: { name: string; lat: number; lng: number; distanceM: number };
  /** Approximate route ride duration in seconds. */
  rideSec: number;
  /** Whether origin is the airport side (true) or destination is (false). */
  airportIsOrigin: boolean;
  departures: KapnosDeparture[];
  bookingUrl: string;
  routeUrl: string;
};

const Point = z.object({ lat: z.number(), lng: z.number() });

/** Convert a unix-second instant to Cyprus-local "YYYY-MM-DD HH:MM:SS". */
function unixToCyprusLocal(unixSec: number): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(unixSec * 1000)).replace("T", " ");
}

export const suggestKapnos = createServerFn({ method: "POST" })
  .inputValidator((input: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    /** Only return departures at/after this instant (unix seconds). */
    afterUnix?: number;
    /** Only return departures at/before this instant (unix seconds). */
    beforeUnix?: number;
  }) =>
    z.object({
      from: Point,
      to: Point,
      afterUnix: z.number().optional(),
      beforeUnix: z.number().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const routes = await fetchKapnosRoutes();
    if (routes.length === 0) return null;
    const nowLocal = nowCyprusLocal();
    // Honor the rider's requested time. If they asked to leave at 7am, never
    // surface the 1am coach. We still floor at "now" so past departures
    // (relative to wall-clock) are filtered out.
    const afterLocal = data.afterUnix
      ? unixToCyprusLocal(data.afterUnix)
      : nowLocal;
    const cutoffLocal = afterLocal > nowLocal ? afterLocal : nowLocal;
    const beforeLocal = data.beforeUnix
      ? unixToCyprusLocal(data.beforeUnix)
      : undefined;

    type Candidate = {
      route: KapnosRoute;
      pickup: KapnosStop;
      dropoff: KapnosStop;
      pickupDist: number;
      dropoffDist: number;
      airportIsOrigin: boolean;
      score: number;
    };
    const candidates: Candidate[] = [];

    for (const route of routes) {
      for (const pk of route.pickups) {
        for (const dr of route.dropoffs) {
          if (!pk.isAirport && !dr.isAirport) continue;
          const pkDistFromOrigin = distanceM(data.from, pk);
          const drDistToDest = distanceM(data.to, dr);
          const airportSide = pk.isAirport ? "pickup" : "dropoff";
          const airportWalk =
            airportSide === "pickup" ? pkDistFromOrigin : drDistToDest;
          const cityWalk =
            airportSide === "pickup" ? drDistToDest : pkDistFromOrigin;
          if (
            airportWalk <= MAX_AIRPORT_WALK_M &&
            cityWalk <= MAX_CITY_WALK_M
          ) {
            candidates.push({
              route,
              pickup: pk,
              dropoff: dr,
              pickupDist: pkDistFromOrigin,
              dropoffDist: drDistToDest,
              airportIsOrigin: airportSide === "pickup",
              score: pkDistFromOrigin + drDistToDest,
            });
          }
        }
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);

    // Walk candidates in order of best (closest) → worst, returning the
    // first one that actually has upcoming departures. The previous
    // implementation locked onto candidates[0] and returned null whenever
    // that route's last bus had already left, even if another viable
    // Kapnos route still had seats for tonight.
    for (const best of candidates) {
      const upcoming = best.route.trips
        .filter((t) => {
          if (!t.departLocal) return false;
          if (t.departLocal <= cutoffLocal) return false;
          if (beforeLocal && t.departLocal > beforeLocal) return false;
          return true;
        })
        .slice(0, SUGGEST_COUNT);
      if (upcoming.length === 0) continue;

      const rideSec = parseRangeToSec(best.dropoff.rangeFromStart);
      const departures: KapnosDeparture[] = upcoming.map((t) => ({
        tripId: t.tripId,
        departLocal: t.departLocal,
        arriveLocal: addLocalSeconds(t.departLocal, rideSec),
        seatsAvailable: t.seatsAvailable,
        priceFrom: t.priceFromFormatted || t.priceFromRaw,
      }));

      const out: KapnosSuggestion = {
        routeId: best.route.id,
        routeCode: best.route.code,
        routeName: best.route.name,
        pickup: {
          name: best.pickup.name,
          lat: best.pickup.lat,
          lng: best.pickup.lng,
          distanceM: Math.round(best.pickupDist),
        },
        dropoff: {
          name: best.dropoff.name,
          lat: best.dropoff.lat,
          lng: best.dropoff.lng,
          distanceM: Math.round(best.dropoffDist),
        },
        rideSec,
        airportIsOrigin: best.airportIsOrigin,
        departures,
        bookingUrl: "https://kapnosairportshuttle.com/",
        routeUrl: "https://kapnosairportshuttle.com/timetables",
      };
      return out;
    }
    return null;
  });
