// Pulse Met-warnings feed — scrapes the Cyprus Department of Meteorology
// warnings page via Firecrawl with two extraction passes:
//   1. Primary  — Firecrawl JSON format with a Zod-mirrored schema (LLM-guided,
//                 survives layout changes on the source page).
//   2. Fallback — markdown regex on the same scrape (cheaper, deterministic;
//                 used when the JSON pass returns an empty/invalid array).
// Whatever lands is validated through Zod, stamped with a confidence label,
// and upserted into pulse_signals under key='met-warnings', scope='island'.

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

export const Route = createFileRoute("/api/public/hooks/pulse-met-warnings")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const WarningLevel = z.enum(["yellow", "orange", "red"]);
const WarningKind = z.enum([
  "thunderstorm",
  "rain",
  "wind",
  "heat",
  "cold",
  "snow",
  "dust",
  "fog",
  "fire",
  "other",
]);

const WarningSchema = z.object({
  level: WarningLevel,
  kind: WarningKind,
  headline: z.string().min(3).max(200),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  regions: z.array(z.string()).default([]),
});
type Warning = z.infer<typeof WarningSchema>;

const PayloadSchema = z.object({
  active: z.boolean(),
  highestLevel: WarningLevel.nullable(),
  warnings: z.array(WarningSchema),
  summary: z.string(),
  source: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  fetchedAt: z.string(),
});

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return json({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500);

  const targetUrl = "https://www.moa.gov.cy/moa/dm/dm.nsf/page31_en/page31_en?OpenDocument";

  // Single Firecrawl scrape, two formats — we keep the API call to one.
  let scrape: {
    success?: boolean;
    json?: { warnings?: unknown };
    markdown?: string;
    data?: { json?: { warnings?: unknown }; markdown?: string };
    error?: string;
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
              "Extract every currently active weather warning issued by the Cyprus " +
              "Department of Meteorology. For each warning return: level (yellow|orange|red), " +
              "kind (thunderstorm|rain|wind|heat|cold|snow|dust|fog|fire|other), a one-line " +
              "headline in English, ISO-8601 validFrom and validTo if stated (else null), " +
              "and a list of affected regions in English. Return { warnings: [...] }. " +
              "If no warnings are active, return { warnings: [] }.",
            schema: {
              type: "object",
              properties: {
                warnings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      level: { type: "string", enum: ["yellow", "orange", "red"] },
                      kind: {
                        type: "string",
                        enum: [
                          "thunderstorm", "rain", "wind", "heat", "cold",
                          "snow", "dust", "fog", "fire", "other",
                        ],
                      },
                      headline: { type: "string" },
                      validFrom: { type: ["string", "null"] },
                      validTo: { type: ["string", "null"] },
                      regions: { type: "array", items: { type: "string" } },
                    },
                    required: ["level", "kind", "headline"],
                  },
                },
              },
              required: ["warnings"],
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

  // Firecrawl v2 may return at the root or under `data`.
  const root = scrape.data ?? scrape;
  const rawWarnings = (root.json as { warnings?: unknown } | undefined)?.warnings;
  const markdown = root.markdown ?? "";

  let warnings: Warning[] = [];
  let confidence: "high" | "medium" | "low" = "high";

  // Primary — Zod-parse each warning, drop the bad ones, keep the good ones.
  if (Array.isArray(rawWarnings) && rawWarnings.length > 0) {
    for (const r of rawWarnings) {
      const parsed = WarningSchema.safeParse(r);
      if (parsed.success) warnings.push(parsed.data);
    }
  }

  // Fallback — markdown regex for "Yellow|Orange|Red Warning ... for ..."
  if (warnings.length === 0 && markdown.length > 0) {
    confidence = "medium";
    const re = /(Yellow|Orange|Red)\s+Warning[^\n]*?for\s+([^\n.]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown)) !== null) {
      const level = m[1].toLowerCase() as Warning["level"];
      const headline = `${m[1]} warning for ${m[2].trim()}`.slice(0, 200);
      warnings.push({
        level,
        kind: inferKind(headline),
        headline,
        validFrom: null,
        validTo: null,
        regions: [],
      });
    }
  }

  // Cap to a sensible upper bound — if we somehow got 50 warnings, the parse drifted.
  if (warnings.length > 12) {
    warnings = warnings.slice(0, 12);
    confidence = "low";
  }

  const highestLevel: Warning["level"] | null = warnings.length
    ? (["red", "orange", "yellow"] as const).find((lvl) =>
        warnings.some((w) => w.level === lvl),
      ) ?? null
    : null;

  const payload = PayloadSchema.parse({
    active: warnings.length > 0,
    highestLevel,
    warnings,
    summary: editorialSummary(warnings, highestLevel),
    source: "cymet.gov.cy",
    confidence,
    fetchedAt: new Date().toISOString(),
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(
      [
        {
          key: "met-warnings",
          scope: "island",
          source: "cymet-firecrawl",
          payload: payload as unknown as Record<string, unknown>,
          ttl_seconds: 1800,
          fetched_at: payload.fetchedAt,
        },
      ] as never,
      { onConflict: "key,scope" },
    );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, active: payload.active, count: warnings.length, confidence });
}

function inferKind(headline: string): Warning["kind"] {
  const h = headline.toLowerCase();
  if (h.includes("thunder")) return "thunderstorm";
  if (h.includes("rain") || h.includes("shower")) return "rain";
  if (h.includes("wind") || h.includes("gale")) return "wind";
  if (h.includes("heat") || h.includes("hot")) return "heat";
  if (h.includes("cold") || h.includes("frost")) return "cold";
  if (h.includes("snow")) return "snow";
  if (h.includes("dust") || h.includes("sand")) return "dust";
  if (h.includes("fog") || h.includes("mist")) return "fog";
  if (h.includes("fire")) return "fire";
  return "other";
}

function editorialSummary(warnings: Warning[], top: Warning["level"] | null): string {
  if (warnings.length === 0 || !top) return "No active weather warnings";
  const first = warnings.find((w) => w.level === top)!;
  const label = top === "red" ? "Red alert" : top === "orange" ? "Orange warning" : "Yellow advisory";
  return `${label} in effect — ${first.headline.replace(/\s+/g, " ").slice(0, 110)}`;
}
