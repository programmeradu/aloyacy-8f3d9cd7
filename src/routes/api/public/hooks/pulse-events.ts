// Pulse events feed — scrapes visitcyprus.com events listing via Firecrawl.
// Dual-pass extraction (JSON schema primary, markdown fallback), Zod-validated,
// 24h TTL. Writes one pulse_signals row at scope='island'.

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

export const Route = createFileRoute("/api/public/hooks/pulse-events")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const EventSchema = z.object({
  title: z.string().min(3).max(200),
  city: z.string().max(60).nullable(),
  venue: z.string().max(120).nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  category: z.string().max(60).nullable(),
  url: z.string().url().nullable(),
});
type EventItem = z.infer<typeof EventSchema>;

const PayloadSchema = z.object({
  count: z.number().int(),
  events: z.array(EventSchema),
  source: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  fetchedAt: z.string(),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          city: { type: "string" },
          venue: { type: "string" },
          startDate: { type: "string", description: "ISO date, YYYY-MM-DD if known" },
          endDate: { type: "string" },
          category: { type: "string" },
          url: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  required: ["events"],
};

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return json({ ok: false, error: "FIRECRAWL_API_KEY not configured" }, 500);

  const targetUrl = "https://www.visitcyprus.com/index.php/en/discovercyprus/events-festivals";
  const fetchedAt = new Date().toISOString();

  let scrape: { json?: { events?: unknown }; markdown?: string; data?: { json?: { events?: unknown }; markdown?: string } };
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["json", "markdown"],
        jsonOptions: {
          schema: JSON_SCHEMA,
          prompt:
            "Extract upcoming public events, festivals, exhibitions, and concerts happening in Cyprus. Include title, city, venue, dates (ISO format if possible), category, and detail URL.",
        },
        onlyMainContent: true,
        waitFor: 1500,
      }),
    });
    if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
    scrape = await res.json();
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "scrape failed" }, 502);
  }

  const jsonNode = scrape.json ?? scrape.data?.json;
  const markdown = scrape.markdown ?? scrape.data?.markdown ?? "";

  let events: EventItem[] = [];
  let confidence: "high" | "medium" | "low" = "low";

  if (Array.isArray(jsonNode?.events)) {
    events = (jsonNode.events as unknown[]).flatMap((raw) => {
      if (typeof raw !== "object" || raw === null) return [];
      const r = raw as Record<string, unknown>;
      const parsed = EventSchema.safeParse({
        title: typeof r.title === "string" ? r.title.trim() : "",
        city: typeof r.city === "string" && r.city.trim() ? r.city.trim() : null,
        venue: typeof r.venue === "string" && r.venue.trim() ? r.venue.trim() : null,
        startDate: typeof r.startDate === "string" && r.startDate.trim() ? r.startDate.trim() : null,
        endDate: typeof r.endDate === "string" && r.endDate.trim() ? r.endDate.trim() : null,
        category: typeof r.category === "string" && r.category.trim() ? r.category.trim() : null,
        url: typeof r.url === "string" && /^https?:\/\//.test(r.url) ? r.url.trim() : null,
      });
      return parsed.success ? [parsed.data] : [];
    });
    if (events.length > 0) confidence = "high";
  }

  if (events.length === 0 && markdown) {
    // Markdown fallback — pull bullet/heading lines that look like event titles.
    const lines = markdown.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^[#*\-\s]*([A-Z][^|·\n]{4,120}?)(?:\s+\|\s+|\s+—\s+|\s+-\s+)([\w\s,]+)?$/);
      if (!m) continue;
      const parsed = EventSchema.safeParse({
        title: m[1].trim(),
        city: m[2]?.trim() || null,
        venue: null,
        startDate: null,
        endDate: null,
        category: null,
        url: null,
      });
      if (parsed.success) events.push(parsed.data);
      if (events.length >= 20) break;
    }
    if (events.length > 0) confidence = "medium";
  }

  events = events.slice(0, 30);

  const payload = PayloadSchema.parse({
    count: events.length,
    events,
    source: "visitcyprus.com",
    confidence,
    fetchedAt,
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(
      [
        {
          key: "events",
          scope: "island",
          source: "visitcyprus",
          payload: payload as unknown as Record<string, unknown>,
          ttl_seconds: 60 * 60 * 24, // 24h
          fetched_at: fetchedAt,
        },
      ] as never,
      { onConflict: "key,scope" },
    );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, count: events.length, confidence });
}
