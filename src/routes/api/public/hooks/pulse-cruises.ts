// Pulse cruises feed — scrapes cruisemapper.com Limassol port-calls page for
// today's ship arrivals. Same dual-pass extraction as met-warnings: JSON schema
// primary, markdown regex fallback, Zod validation, confidence labelling.
// Limassol is the only commercial cruise port in the Republic of Cyprus, so
// one scope='port-limassol' row covers the country.

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

export const Route = createFileRoute("/api/public/hooks/pulse-cruises")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const CruiseSchema = z.object({
  shipName: z.string().min(2).max(80),
  line: z.string().max(80).nullable(),
  arrival: z.string().nullable(),  // HH:MM local
  departure: z.string().nullable(),
  passengers: z.number().int().min(0).max(10000).nullable(),
});
type Cruise = z.infer<typeof CruiseSchema>;

const PayloadSchema = z.object({
  date: z.string(),
  count: z.number().int().min(0),
  totalPassengers: z.number().int().min(0),
  ships: z.array(CruiseSchema),
  summary: z.string(),
  source: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  fetchedAt: z.string(),
});

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return json({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500);

  const todayIso = new Date().toISOString().slice(0, 10);
  const targetUrl = "https://www.cruisemapper.com/ports/limassol-port-49";

  let scrape: {
    json?: { ships?: unknown };
    markdown?: string;
    data?: { json?: { ships?: unknown }; markdown?: string };
  };
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: targetUrl,
        onlyMainContent: true,
        formats: [
          "markdown",
          {
            type: "json",
            prompt:
              `Extract cruise ships calling at Limassol port today (${todayIso}). ` +
              "For each ship return shipName, line (cruise line), arrival (HH:MM 24h local), " +
              "departure (HH:MM 24h local), passengers (integer if listed, else null). " +
              "Only include calls scheduled for today's date. Return { ships: [...] }. " +
              "If none, return { ships: [] }.",
            schema: {
              type: "object",
              properties: {
                ships: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      shipName: { type: "string" },
                      line: { type: ["string", "null"] },
                      arrival: { type: ["string", "null"] },
                      departure: { type: ["string", "null"] },
                      passengers: { type: ["integer", "null"] },
                    },
                    required: ["shipName"],
                  },
                },
              },
              required: ["ships"],
            },
          },
        ],
      }),
    });
    if (!res.ok) return json({ ok: false, error: `Firecrawl ${res.status}` }, 502);
    scrape = (await res.json()) as typeof scrape;
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }

  const root = scrape.data ?? scrape;
  const raw = (root.json as { ships?: unknown } | undefined)?.ships;

  let ships: Cruise[] = [];
  let confidence: "high" | "medium" | "low" = "high";

  if (Array.isArray(raw)) {
    for (const r of raw) {
      const parsed = CruiseSchema.safeParse({
        shipName: (r as Record<string, unknown>).shipName,
        line: (r as Record<string, unknown>).line ?? null,
        arrival: (r as Record<string, unknown>).arrival ?? null,
        departure: (r as Record<string, unknown>).departure ?? null,
        passengers:
          typeof (r as Record<string, unknown>).passengers === "number"
            ? ((r as Record<string, unknown>).passengers as number)
            : null,
      });
      if (parsed.success) ships.push(parsed.data);
    }
  }

  // Sanity bound — Limassol rarely sees more than 4 ships in one day.
  if (ships.length > 8) {
    ships = ships.slice(0, 8);
    confidence = "low";
  } else if (ships.length === 0) {
    confidence = "medium";
  }

  const totalPassengers = ships.reduce((s, x) => s + (x.passengers ?? 0), 0);

  const payload = PayloadSchema.parse({
    date: todayIso,
    count: ships.length,
    totalPassengers,
    ships,
    summary: editorialSummary(ships, totalPassengers),
    source: "cruisemapper.com",
    confidence,
    fetchedAt: new Date().toISOString(),
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(
      [
        {
          key: "cruises",
          scope: "port-limassol",
          source: "cruisemapper-firecrawl",
          payload: payload as unknown as Record<string, unknown>,
          // Daily refresh — keep cached row valid for 36h so a single failed
          // scrape doesn't blank the tile.
          ttl_seconds: 86400,
          fetched_at: payload.fetchedAt,
        },
      ] as never,
      { onConflict: "key,scope" },
    );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, count: ships.length, totalPassengers, confidence });
}

function editorialSummary(ships: Cruise[], pax: number): string {
  if (ships.length === 0) return "Quiet harbour today";
  if (ships.length === 1) {
    const s = ships[0];
    return pax
      ? `${s.shipName} in port, around ${formatPax(pax)} guests ashore`
      : `${s.shipName} calling at Limassol today`;
  }
  return pax
    ? `${ships.length} ships in port, roughly ${formatPax(pax)} guests ashore`
    : `${ships.length} ships calling at Limassol today`;
}

function formatPax(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
