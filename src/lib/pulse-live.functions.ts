// Pulse live signals reader — single, location-aware query that gathers all
// currently fresh rows from `pulse_signals`, drops anything past its TTL, and
// returns one normalised payload per editorial axis (environment, transport,
// culture). The Pulse page calls this once and renders whatever exists for
// the rider's nearest zone (with `island` rollup as fallback).
//
// We deliberately do NOT throw on missing signals. The Pulse page should
// gracefully render what's available — a fresh marine reading shouldn't be
// blocked by an air-quality outage.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nearestZone, PULSE_ZONES, type PulseZone } from "@/lib/pulse-zones";

// ---------- Per-feed payload shapes (subset; safe-cast everything else) -----

export type NewsItem = {
  title: string;
  url: string;
  source: string;
  category: string | null;
  publishedAt: string;
};
export type NewsPayload = {
  count: number;
  items: NewsItem[];
  sources: string[];
  fetchedAt: string;
};

export type MarinePayload = {
  zone: string;
  city: string;
  waveHeightM: number | null;
  wavePeriodS: number | null;
  swellHeightM: number | null;
  seaTempC: number | null;
  beachVerdict: "great" | "good" | "choppy" | "rough" | null;
  summary: string;
  observedAt: string | null;
};

export type AirPayload = {
  zone: string;
  city: string;
  europeanAqi: number | null;
  pm10: number | null;
  pm25: number | null;
  band: "good" | "fair" | "moderate" | "poor" | "very-poor" | null;
  dustAlert: boolean;
  summary: string;
};

export type WeatherPayload = {
  city: string;
  tempC: number | null;
  feelsLikeC: number | null;
  windKmh: number | null;
  conditionCode: number | null;
  summary: string;
};

export type MetWarning = {
  level: "yellow" | "orange" | "red";
  kind: string;
  area: string;
  startsAt: string | null;
  endsAt: string | null;
  summary: string;
};
export type MetWarningsPayload = {
  count: number;
  warnings: MetWarning[];
  confidence: "high" | "medium" | "low";
};

export type CruiseShip = {
  shipName: string;
  line: string | null;
  arrival: string | null;
  departure: string | null;
  passengers: number | null;
};
export type CruisesPayload = {
  date: string;
  count: number;
  totalPassengers: number;
  ships: CruiseShip[];
  summary: string;
};

export type FlightItem = {
  callsign: string | null;
  direction: "arrival" | "departure";
  otherAirport: string | null;
  scheduled: string;
  estimated: string | null;
};
export type FlightsPayload = {
  airport: "LCLK" | "LCPH";
  city: string;
  arrivalsNext60: number;
  departuresNext60: number;
  arrivals: FlightItem[];
  departures: FlightItem[];
  summary: string;
};

export type EventItem = {
  title: string;
  city: string | null;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  url: string | null;
};
export type EventsPayload = {
  count: number;
  events: EventItem[];
};

export type Fixture = {
  home: string;
  away: string;
  kickoff: string | null;
  venue: string | null;
  city: string | null;
  competition: string | null;
};
export type FixturesPayload = {
  count: number;
  fixtures: Fixture[];
};

// ---------- Public response shape ------------------------------------------

export type PulseLiveBundle = {
  generatedAt: number;
  /** Resolved focus zone — what the rider is "near". */
  focus: {
    id: PulseZone;
    label: string;
    labelEl: string;
    lat: number;
    lng: number;
    coastal: boolean;
  };
  /** Environment axis */
  weather: WeatherPayload | null;
  marine: MarinePayload | null;
  air: AirPayload | null;
  metWarnings: MetWarningsPayload | null;
  /** Transport context axis */
  cruises: CruisesPayload | null;
  flights: FlightsPayload[];
  /** Culture axis */
  news: NewsPayload | null;
  events: EventsPayload | null;
  fixtures: FixturesPayload | null;
};

// ---------- Loader ----------------------------------------------------------

const InputSchema = z.object({
  lat: z.number().min(34).max(36).optional(),
  lng: z.number().min(32).max(35).optional(),
});

export const getPulseLive = createServerFn({ method: "GET" })
  .inputValidator((input: { lat?: number; lng?: number } | undefined) =>
    InputSchema.parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve focus zone from coords (default Nicosia — capital, most riders).
    const focusZone =
      data.lat != null && data.lng != null
        ? nearestZone(data.lat, data.lng)
        : PULSE_ZONES[0];

    // Pull every fresh row in one query. Server-side TTL filter keeps payload tight.
    const { data: rows, error } = await supabaseAdmin
      .from("pulse_signals")
      .select("key, scope, source, payload, fetched_at, ttl_seconds")
      .gte("fetched_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order("fetched_at", { ascending: false });

    if (error || !rows) {
      return emptyBundle(focusZone);
    }

    const now = Date.now();
    type SignalRow = {
      key: string;
      scope: string;
      source: string;
      payload: Record<string, unknown>;
      fetched_at: string;
      ttl_seconds: number;
    };

    // Group fresh rows by (key → scope → row).
    const fresh = new Map<string, Map<string, SignalRow>>();
    for (const r of rows as SignalRow[]) {
      const ttlMs = (r.ttl_seconds ?? 3600) * 1000;
      if (now - Date.parse(r.fetched_at) > ttlMs) continue;
      const byScope = fresh.get(r.key) ?? new Map<string, SignalRow>();
      // First-write wins (rows are ordered newest-first).
      if (!byScope.has(r.scope)) byScope.set(r.scope, r);
      fresh.set(r.key, byScope);
    }

    /** Pick the best-matching scope for a given key: focus zone → island. */
    function pick<T>(key: string, preferred: string[]): T | null {
      const byScope = fresh.get(key);
      if (!byScope) return null;
      for (const s of preferred) {
        const row = byScope.get(s);
        if (row) return row.payload as T;
      }
      return null;
    }

    // Environment
    const weather = pick<WeatherPayload>("weather", [focusZone.id, "island"]);
    const marine = focusZone.coastal
      ? pick<MarinePayload>("marine", [focusZone.id, "island"])
      : null;
    const air = pick<AirPayload>("air", [focusZone.id, "island"]);
    const metWarnings = pick<MetWarningsPayload>("met-warnings", ["island"]);

    // Transport context
    const cruises = pick<CruisesPayload>("cruises", ["port-limassol", "island"]);
    const flightAirports: PulseLiveBundle["flights"] = [];
    for (const ap of ["airport-lca", "airport-pfo"] as const) {
      const f = pick<FlightsPayload>("flights", [ap]);
      if (f) flightAirports.push(f);
    }

    // Culture
    const news = pick<NewsPayload>("news", ["island"]);
    const events = pick<EventsPayload>("events", ["island"]);
    const fixtures = pick<FixturesPayload>("football", ["island"]);

    return {
      generatedAt: Math.floor(now / 1000),
      focus: {
        id: focusZone.id,
        label: focusZone.label,
        labelEl: focusZone.labelEl,
        lat: focusZone.lat,
        lng: focusZone.lng,
        coastal: focusZone.coastal,
      },
      weather,
      marine,
      air,
      metWarnings,
      cruises,
      flights: flightAirports,
      news,
      events,
      fixtures,
    } satisfies PulseLiveBundle;
  });

function emptyBundle(focusZone: (typeof PULSE_ZONES)[number]): PulseLiveBundle {
  return {
    generatedAt: Math.floor(Date.now() / 1000),
    focus: {
      id: focusZone.id,
      label: focusZone.label,
      labelEl: focusZone.labelEl,
      lat: focusZone.lat,
      lng: focusZone.lng,
      coastal: focusZone.coastal,
    },
    weather: null,
    marine: null,
    air: null,
    metWarnings: null,
    cruises: null,
    flights: [],
    news: null,
    events: null,
    fixtures: null,
  };
}
