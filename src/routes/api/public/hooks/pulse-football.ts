// Pulse football fixtures — Cyprus First Division (CFA) upcoming matches.
// Scrapes a public fixtures page via Firecrawl, dual-pass extraction, Zod
// validated. Useful because match days move ~20-40k people around the island
// (parking, late buses, traffic spikes near GSP / Tsirio / AEK Arena).

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

export const Route = createFileRoute("/api/public/hooks/pulse-football")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const FixtureSchema = z.object({
  home: z.string().min(2).max(60),
  away: z.string().min(2).max(60),
  kickoff: z.string().nullable(), // ISO or null
  venue: z.string().max(80).nullable(),
  city: z.string().max(40).nullable(),
  competition: z.string().max(60).nullable(),
});
type Fixture = z.infer<typeof FixtureSchema>;

const PayloadSchema = z.object({
  count: z.number().int(),
  fixtures: z.array(FixtureSchema),
  source: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  fetchedAt: z.string(),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    fixtures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          home: { type: "string" },
          away: { type: "string" },
          kickoff: { type: "string", description: "ISO 8601 datetime if available" },
          venue: { type: "string" },
          city: { type: "string", description: "Nicosia, Limassol, Larnaca, Paphos, etc." },
          competition: { type: "string" },
        },
        required: ["home", "away"],
      },
    },
  },
  required: ["fixtures"],
};

const VENUE_CITY: Array<[RegExp, string]> = [
  [/gsp/i, "Nicosia"],
  [/makari/i, "Nicosia"],
  [/tsirio|alphamega/i, "Limassol"],
  [/limassol arena|colossi/i, "Limassol"],
  [/ammochostos|aek arena|aek\s*arena|larnaca/i, "Larnaca"],
  [/paphiako|paphos|pafos/i, "Paphos"],
];

function inferCity(venue: string | null, hint: string | null): string | null {
  if (hint && hint.trim()) return hint.trim();
  if (!venue) return null;
  for (const [re, city] of VENUE_CITY) if (re.test(venue)) return city;
  return null;
}

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return json({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500);

  // soccerway is structured, public, multilingual — easier than CFA's own site.
  const targetUrl = "https://int.soccerway.com/national/cyprus/first-division/20242025/regular-season/r79123/";
  const fetchedAt = new Date().toISOString();

  let scrape: { json?: { fixtures?: unknown }; markdown?: string; data?: { json?: { fixtures?: unknown }; markdown?: string } };
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        onlyMainContent: true,
        waitFor: 1500,
        formats: [
          "markdown",
          {
            type: "json",
            schema: JSON_SCHEMA,
            prompt:
              "Extract upcoming Cyprus First Division football fixtures (future matches only, not finished ones). Include both team names, kickoff datetime if available, venue, host city, and competition name.",
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
    scrape = await res.json();
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "scrape failed" }, 502);
  }

  const jsonNode = scrape.json ?? scrape.data?.json;
  const markdown = scrape.markdown ?? scrape.data?.markdown ?? "";

  let fixtures: Fixture[] = [];
  let confidence: "high" | "medium" | "low" = "low";

  if (Array.isArray(jsonNode?.fixtures)) {
    fixtures = (jsonNode.fixtures as unknown[]).flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const r = raw as Record<string, unknown>;
      const venue = typeof r.venue === "string" && r.venue.trim() ? r.venue.trim() : null;
      const cityHint = typeof r.city === "string" && r.city.trim() ? r.city.trim() : null;
      const parsed = FixtureSchema.safeParse({
        home: typeof r.home === "string" ? r.home.trim() : "",
        away: typeof r.away === "string" ? r.away.trim() : "",
        kickoff: typeof r.kickoff === "string" && r.kickoff.trim() ? r.kickoff.trim() : null,
        venue,
        city: inferCity(venue, cityHint),
        competition: typeof r.competition === "string" && r.competition.trim() ? r.competition.trim() : "Cyprus First Division",
      });
      return parsed.success ? [parsed.data] : [];
    });
    if (fixtures.length > 0) confidence = "high";
  }

  if (fixtures.length === 0 && markdown) {
    // Markdown fallback: lines like "Team A - Team B" or "Team A vs Team B".
    const lines = markdown.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z][\w\s.&'-]{1,40})\s+(?:vs?|-|–|—)\s+([A-Z][\w\s.&'-]{1,40})\s*$/);
      if (!m) continue;
      const parsed = FixtureSchema.safeParse({
        home: m[1].trim(),
        away: m[2].trim(),
        kickoff: null,
        venue: null,
        city: null,
        competition: "Cyprus First Division",
      });
      if (parsed.success) fixtures.push(parsed.data);
      if (fixtures.length >= 12) break;
    }
    if (fixtures.length > 0) confidence = "medium";
  }

  // Future-only when kickoff known; cap 24.
  const now = Date.now();
  fixtures = fixtures
    .filter((f) => !f.kickoff || Date.parse(f.kickoff) >= now - 2 * 3600 * 1000)
    .sort((a, b) => (Date.parse(a.kickoff ?? "9999") || 0) - (Date.parse(b.kickoff ?? "9999") || 0))
    .slice(0, 24);

  const payload = PayloadSchema.parse({
    count: fixtures.length,
    fixtures,
    source: "int.soccerway.com",
    confidence,
    fetchedAt,
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(
      [
        {
          key: "football",
          scope: "island",
          source: "soccerway",
          payload: payload as unknown as Record<string, unknown>,
          ttl_seconds: 60 * 60 * 12, // 12h
          fetched_at: fetchedAt,
        },
      ] as never,
      { onConflict: "key,scope" },
    );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, count: fixtures.length, confidence });
}
