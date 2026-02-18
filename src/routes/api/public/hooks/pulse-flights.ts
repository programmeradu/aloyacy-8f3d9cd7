// Pulse flights feed — OpenSky Network (free, anonymous, no API key) for
// Larnaca (LCLK) and Paphos (LCPH). Pulls arrivals and departures in a
// ±2h window around now, normalises into a compact payload, and writes
// one pulse_signals row per airport (scope='airport-lca' | 'airport-pfo').
//
// OpenSky's anonymous tier is rate-limited (~100 req/day) and occasionally
// returns 404 when no movements match the window — that's a normal empty
// result, not an error, so we cache it just the same.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, X-Cron-Secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function guard(request: Request): Promise<Response | null> {
  const apikey = request.headers.get("apikey");
  const legacy =
    request.headers.get("x-cron-secret") ??
    new URL(request.url).searchParams.get("cron_secret");
  const validApiKey = apikey && apikey === process.env.SUPABASE_PUBLISHABLE_KEY;
  const validLegacy = legacy && process.env.CRON_SECRET && legacy === process.env.CRON_SECRET;
  if (!validApiKey && !validLegacy) return json({ ok: false, error: "Unauthorized" }, 401);
  return null;
}

export const Route = createFileRoute("/api/public/hooks/pulse-flights")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const FlightSchema = z.object({
  callsign: z.string().nullable(),
  direction: z.enum(["arrival", "departure"]),
  otherAirport: z.string().nullable(),  // ICAO of the other end
  scheduled: z.string(),                // ISO local
  estimated: z.string().nullable(),
});
type Flight = z.infer<typeof FlightSchema>;

const AirportPayloadSchema = z.object({
  airport: z.enum(["LCLK", "LCPH"]),
  city: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  arrivals: z.array(FlightSchema),
  departures: z.array(FlightSchema),
  arrivalsNext60: z.number().int(),
  departuresNext60: z.number().int(),
  summary: z.string(),
  source: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  fetchedAt: z.string(),
});
type AirportPayload = z.infer<typeof AirportPayloadSchema>;

type OpenSkyFlight = {
  icao24?: string;
  firstSeen?: number;
  lastSeen?: number;
  estDepartureAirport?: string | null;
  estArrivalAirport?: string | null;
  callsign?: string | null;
};

const AIRPORTS = [
  { icao: "LCLK" as const, city: "Larnaca",  scope: "airport-lca" },
  { icao: "LCPH" as const, city: "Paphos",   scope: "airport-pfo" },
];

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const now = Math.floor(Date.now() / 1000);
  const begin = now - 2 * 3600;
  const end = now + 2 * 3600;
  const fetchedAt = new Date().toISOString();

  const results: Array<{ airport: string; ok: boolean; payload?: AirportPayload; error?: string }> = [];

  for (const a of AIRPORTS) {
    try {
      const [arrivalsRaw, departuresRaw] = await Promise.all([
        fetchOpenSky(`arrival?airport=${a.icao}&begin=${begin}&end=${end}`),
        fetchOpenSky(`departure?airport=${a.icao}&begin=${begin}&end=${end}`),
      ]);

      const arrivals: Flight[] = (arrivalsRaw ?? []).flatMap((f) => {
        const parsed = FlightSchema.safeParse({
          callsign: f.callsign?.trim() || null,
          direction: "arrival" as const,
          otherAirport: f.estDepartureAirport ?? null,
          scheduled: new Date(((f.lastSeen ?? now) * 1000)).toISOString(),
          estimated: null,
        });
        return parsed.success ? [parsed.data] : [];
      });

      const departures: Flight[] = (departuresRaw ?? []).flatMap((f) => {
        const parsed = FlightSchema.safeParse({
          callsign: f.callsign?.trim() || null,
          direction: "departure" as const,
          otherAirport: f.estArrivalAirport ?? null,
          scheduled: new Date(((f.firstSeen ?? now) * 1000)).toISOString(),
          estimated: null,
        });
        return parsed.success ? [parsed.data] : [];
      });

      arrivals.sort((x, y) => x.scheduled.localeCompare(y.scheduled));
      departures.sort((x, y) => x.scheduled.localeCompare(y.scheduled));

      const sixtyFromNow = now + 3600;
      const arrivalsNext60 = arrivals.filter(
        (f) => Date.parse(f.scheduled) / 1000 >= now && Date.parse(f.scheduled) / 1000 <= sixtyFromNow,
      ).length;
      const departuresNext60 = departures.filter(
        (f) => Date.parse(f.scheduled) / 1000 >= now && Date.parse(f.scheduled) / 1000 <= sixtyFromNow,
      ).length;

      const payload = AirportPayloadSchema.parse({
        airport: a.icao,
        city: a.city,
        windowStart: new Date(begin * 1000).toISOString(),
        windowEnd: new Date(end * 1000).toISOString(),
        arrivals: arrivals.slice(0, 25),
        departures: departures.slice(0, 25),
        arrivalsNext60,
        departuresNext60,
        summary: airportSummary(a.city, arrivalsNext60, departuresNext60),
        source: "opensky-network.org",
        confidence: arrivals.length + departures.length > 0 ? "high" : "medium",
        fetchedAt,
      });

      const { error } = await supabaseAdmin
        .from("pulse_signals")
        .upsert(
          [
            {
              key: "flights",
              scope: a.scope,
              source: "opensky",
              payload: payload as unknown as Record<string, unknown>,
              ttl_seconds: 900,
              fetched_at: fetchedAt,
            },
          ] as never,
          { onConflict: "key,scope" },
        );
      if (error) {
        results.push({ airport: a.icao, ok: false, error: error.message });
      } else {
        results.push({ airport: a.icao, ok: true, payload });
      }
    } catch (e) {
      results.push({
        airport: a.icao,
        ok: false,
        error: e instanceof Error ? e.message : "fetch failed",
      });
    }
  }

  return json({ ok: results.some((r) => r.ok), results });
}

async function fetchOpenSky(qs: string): Promise<OpenSkyFlight[] | null> {
  const res = await fetch(`https://opensky-network.org/api/flights/${qs}`, {
    headers: { "User-Agent": "Aloya/1.0 (+https://aloya.cy)" },
  });
  // 404 = no flights in window. Treat as empty, not as error.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OpenSky ${res.status}`);
  return (await res.json()) as OpenSkyFlight[];
}

function airportSummary(city: string, arr: number, dep: number): string {
  if (arr === 0 && dep === 0) return `${city} airport quiet in the next hour`;
  if (arr >= dep) {
    return `${city} arrivals next hour — ${arr}${dep ? `, ${dep} departing` : ""}`;
  }
  return `${city} departures next hour — ${dep}${arr ? `, ${arr} arriving` : ""}`;
}
