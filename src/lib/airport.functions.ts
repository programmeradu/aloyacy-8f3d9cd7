// Airport landing pages (Larnaca / Paphos) — server data.
//
// Combines two live sources:
//   1. Kapnos Airport Shuttle feed (via fetchKapnosRoutes) — every coach
//      service whose pickup is this airport, with the next ~3 upcoming
//      departures per destination city.
//   2. pulse_signals rows (scope='airport-lca'|'airport-pfo', key='flights')
//      — current OpenSky-derived arrivals/departures window.
//
// One server call returns everything the page needs; no client-side
// fetch waterfalls, so the route is fast to first paint and SSR-stable.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchKapnosRoutes, type KapnosRoute, type KapnosStop } from "./kapnos.functions";

export type AirportCode = "lca" | "pfo";

export type AirportMeta = {
  code: AirportCode;
  iata: string;
  icao: "LCLK" | "LCPH";
  name: string;
  nameEl: string;
  city: string;
  cityEl: string;
  lat: number;
  lng: number;
  pulseScope: "airport-lca" | "airport-pfo";
};

export const AIRPORTS: Record<AirportCode, AirportMeta> = {
  lca: {
    code: "lca",
    iata: "LCA",
    icao: "LCLK",
    name: "Larnaca International Airport",
    nameEl: "Διεθνές Αεροδρόμιο Λάρνακας",
    city: "Larnaca",
    cityEl: "Λάρνακα",
    lat: 34.8751,
    lng: 33.6249,
    pulseScope: "airport-lca",
  },
  pfo: {
    code: "pfo",
    iata: "PFO",
    icao: "LCPH",
    name: "Paphos International Airport",
    nameEl: "Διεθνές Αεροδρόμιο Πάφου",
    city: "Paphos",
    cityEl: "Πάφος",
    lat: 34.7180,
    lng: 32.4857,
    pulseScope: "airport-pfo",
  },
};

export type AirportCoachLine = {
  routeId: string;
  routeCode: string;
  /** Pretty destination city ("Nicosia"). */
  destinationCity: string;
  /** Full Kapnos route name ("LARNACA > NICOSIA"). */
  routeName: string;
  pickupName: string;
  dropoffName: string;
  dropoffLat: number;
  dropoffLng: number;
  /** Approx ride duration, minutes. */
  rideMin: number;
  /** Lowest price string from feed ("€8"). */
  priceFrom: string | null;
  nextDepartures: Array<{
    tripId: string;
    /** "HH:MM" Cyprus local. */
    depart: string;
    /** "HH:MM" Cyprus local. */
    arrive: string;
    /** "" if today, otherwise short label like "tomorrow" or "Wed 25". */
    dayChip: string;
    seatsAvailable: number;
    priceFrom: string | null;
  }>;
};

export type AirportFlightRow = {
  callsign: string | null;
  otherAirport: string | null;
  /** "HH:MM" Cyprus local. */
  scheduled: string;
};

export type AirportFlights = {
  arrivalsNext60: number;
  departuresNext60: number;
  summary: string;
  fetchedAt: string;
  source: string;
  arrivals: AirportFlightRow[];
  departures: AirportFlightRow[];
} | null;

export type AirportPageData = {
  airport: AirportMeta;
  coachLines: AirportCoachLine[];
  flights: AirportFlights;
};

function parseRangeToSec(r: string | undefined): number {
  if (!r) return 0;
  const [h, m, s] = r.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 3600 + m * 60 + s;
}

function addLocalSeconds(local: string, addSec: number): string {
  const [date, time] = local.split(" ");
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const [h, m, s] = time.split(":").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(Y, M - 1, D, h, m, s));
  d.setUTCSeconds(d.getUTCSeconds() + addSec);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function nowCyprusLocal(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date()).replace("T", " ");
}

function todayCyprus(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function hhmm(local: string): string {
  return (local.split(" ")[1] ?? "").slice(0, 5);
}

function dayChip(local: string): string {
  const date = local.split(" ")[0];
  const today = todayCyprus();
  if (date === today) return "";
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const [tY, tM, tD] = today.split("-").map((n) => parseInt(n, 10));
  const diff = Math.round((Date.UTC(Y, M - 1, D) - Date.UTC(tY, tM - 1, tD)) / 86_400_000);
  if (diff === 1) return "tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(Date.UTC(Y, M - 1, D)));
}

function prettyCity(name: string): string {
  // Strip leading code and lowercase the rest. "NICOSIA - CITY (CO1)" -> "Nicosia"
  const stripped = name.replace(/^\([A-Z0-9]+\)\s*/i, "").replace(/\s*-\s*.*$/, "").trim();
  return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}

function destinationFromRouteName(routeName: string, fallback: string): string {
  // "LARNACA > NICOSIA" → "Nicosia"
  const parts = routeName.split(/\s*>\s*/);
  const last = parts[parts.length - 1] ?? fallback;
  return last.charAt(0) + last.slice(1).toLowerCase();
}

function isAirportStop(s: KapnosStop, iata: string): boolean {
  const n = s.name.toUpperCase();
  return s.isAirport && (n.includes(iata) || n.includes("AIRPORT"));
}

const InputSchema = z.object({ code: z.enum(["lca", "pfo"]) });

export const getAirportPage = createServerFn({ method: "GET" })
  .inputValidator((input: { code: AirportCode }) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AirportPageData> => {
    const airport = AIRPORTS[data.code];
    const [routes, flights] = await Promise.all([
      fetchKapnosRoutes().catch(() => [] as KapnosRoute[]),
      fetchFlights(airport.pulseScope),
    ]);

    const cutoff = nowCyprusLocal();
    const lines: AirportCoachLine[] = [];

    for (const route of routes) {
      // Only routes that BOARD at this airport.
      const pickup = route.pickups.find((p) => isAirportStop(p, airport.iata));
      if (!pickup) continue;
      // Pick the "city" dropoff: prefer the first non-airport, longest range.
      const cityDropoffs = route.dropoffs.filter((d) => !d.isAirport);
      if (cityDropoffs.length === 0) continue;
      // Group by destination city — the feed lists multiple stops per city
      // (e.g. "Nicosia - Solomos Sq.", "Nicosia - Latsia"). We surface the
      // first/main one (typically the central terminal) per city.
      const seenCity = new Set<string>();
      for (const dropoff of cityDropoffs) {
        const city = destinationFromRouteName(route.name, prettyCity(dropoff.name));
        if (seenCity.has(city)) continue;
        seenCity.add(city);
        const rideSec = parseRangeToSec(dropoff.rangeFromStart);
        const upcoming = route.trips
          .filter((t) => t.departLocal && t.departLocal > cutoff)
          .slice(0, 3);
        if (upcoming.length === 0) continue;
        lines.push({
          routeId: route.id,
          routeCode: route.code,
          destinationCity: city,
          routeName: route.name,
          pickupName: pickup.name,
          dropoffName: dropoff.name,
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          rideMin: Math.max(1, Math.round(rideSec / 60)),
          priceFrom: upcoming[0]?.priceFromFormatted || upcoming[0]?.priceFromRaw || null,
          nextDepartures: upcoming.map((t) => ({
            tripId: t.tripId,
            depart: hhmm(t.departLocal),
            arrive: hhmm(addLocalSeconds(t.departLocal, rideSec)),
            dayChip: dayChip(t.departLocal),
            seatsAvailable: t.seatsAvailable,
            priceFrom: t.priceFromFormatted || t.priceFromRaw || null,
          })),
        });
        // Keep listing small: one line per destination city is enough.
        break;
      }
    }

    // Sort by ride time ascending so closest cities surface first.
    lines.sort((a, b) => a.rideMin - b.rideMin);

    return { airport, coachLines: lines, flights };
  });

async function fetchFlights(scope: "airport-lca" | "airport-pfo"): Promise<AirportFlights> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("pulse_signals")
      .select("payload, fetched_at, ttl_seconds, source")
      .eq("key", "flights")
      .eq("scope", scope)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !row) return null;
    const ttlMs = ((row.ttl_seconds as number | null) ?? 900) * 1000;
    if (Date.now() - Date.parse(row.fetched_at as string) > ttlMs) return null;
    const p = row.payload as {
      arrivalsNext60?: number;
      departuresNext60?: number;
      summary?: string;
      arrivals?: Array<{ callsign: string | null; otherAirport: string | null; scheduled: string }>;
      departures?: Array<{ callsign: string | null; otherAirport: string | null; scheduled: string }>;
    };
    const tz = (iso: string): string =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Nicosia",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso));
    const mapFlight = (f: { callsign: string | null; otherAirport: string | null; scheduled: string }): AirportFlightRow => ({
      callsign: f.callsign,
      otherAirport: f.otherAirport,
      scheduled: tz(f.scheduled),
    });
    return {
      arrivalsNext60: p.arrivalsNext60 ?? 0,
      departuresNext60: p.departuresNext60 ?? 0,
      summary: p.summary ?? "",
      fetchedAt: row.fetched_at as string,
      source: (row.source as string) ?? "opensky",
      arrivals: (p.arrivals ?? []).slice(0, 8).map(mapFlight),
      departures: (p.departures ?? []).slice(0, 8).map(mapFlight),
    };
  } catch {
    return null;
  }
}
