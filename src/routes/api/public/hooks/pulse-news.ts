// Pulse news rotator — pulls headlines from Cyprus-focused English RSS feeds
// (Cyprus Mail, in-cyprus.com), de-duplicates by URL, ranks by recency, keeps
// the top 12, and writes one pulse_signals row at scope='island'. The Pulse
// page rotates through these without a hard refresh.

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

export const Route = createFileRoute("/api/public/hooks/pulse-news")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const ItemSchema = z.object({
  title: z.string().min(3).max(280),
  url: z.string().url(),
  source: z.string(),
  category: z.string().nullable(),
  publishedAt: z.string(),
});
type Item = z.infer<typeof ItemSchema>;

const PayloadSchema = z.object({
  count: z.number().int(),
  items: z.array(ItemSchema),
  sources: z.array(z.string()),
  fetchedAt: z.string(),
});

const FEEDS: Array<{ name: string; url: string; category: string | null }> = [
  { name: "Cyprus Mail",  url: "https://cyprus-mail.com/feed/",          category: null },
  { name: "in-cyprus",    url: "https://in-cyprus.philenews.com/feed/",  category: null },
];

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fetchedAt = new Date().toISOString();

  const collected: Item[] = [];
  const sourcesOk: string[] = [];
  const errors: Array<{ source: string; error: string }> = [];

  await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: {
            "User-Agent": "Aloya/1.0 (+https://aloya.cy)",
            Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const items = parseRss(xml, feed.name, feed.category);
        if (items.length > 0) sourcesOk.push(feed.name);
        collected.push(...items);
      } catch (e) {
        errors.push({ source: feed.name, error: e instanceof Error ? e.message : "fetch failed" });
      }
    }),
  );

  // De-dup by canonical URL, sort newest-first, cap at 12.
  const byUrl = new Map<string, Item>();
  for (const it of collected) {
    const key = it.url.split("?")[0];
    const prev = byUrl.get(key);
    if (!prev || Date.parse(it.publishedAt) > Date.parse(prev.publishedAt)) byUrl.set(key, it);
  }
  const items = Array.from(byUrl.values())
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 12);

  if (items.length === 0) {
    return json({ ok: false, errors, message: "no items parsed" }, 502);
  }

  const payload = PayloadSchema.parse({
    count: items.length,
    items,
    sources: sourcesOk,
    fetchedAt,
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(
      [
        {
          key: "news",
          scope: "island",
          source: "rss",
          payload: payload as unknown as Record<string, unknown>,
          ttl_seconds: 1800,
          fetched_at: fetchedAt,
        },
      ] as never,
      { onConflict: "key,scope" },
    );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, count: items.length, sources: sourcesOk, errors });
}

// Minimal RSS 2.0 / Atom parser — no DOM, no XML library (Worker-safe).
// Pulls <item> blocks and extracts title, link, pubDate, category.
function parseRss(xml: string, source: string, fallbackCategory: string | null): Item[] {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const out: Item[] = [];
  for (const block of blocks) {
    const title = unwrap(pick(block, "title"));
    const link = unwrap(pick(block, "link")) || linkHref(block);
    const pub = unwrap(pick(block, "pubDate")) || unwrap(pick(block, "published")) || unwrap(pick(block, "updated"));
    const category = unwrap(pick(block, "category")) || fallbackCategory;
    if (!title || !link) continue;
    const publishedAt = pub ? new Date(pub).toISOString() : new Date().toISOString();
    const parsed = ItemSchema.safeParse({
      title: title.slice(0, 280),
      url: link.trim(),
      source,
      category: category ? String(category).slice(0, 60) : null,
      publishedAt,
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function pick(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function linkHref(block: string): string {
  const m = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

function unwrap(raw: string | null): string {
  if (!raw) return "";
  let s = raw.trim();
  // Strip CDATA wrappers
  s = s.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1");
  // Decode common entities
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ");
  // Strip any leftover tags
  s = s.replace(/<[^>]+>/g, "").trim();
  return s;
}
