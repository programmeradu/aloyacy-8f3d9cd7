// Pulse marine feed — Open-Meteo Marine API for coastal zones only.
// Wave height, wave period, sea-surface temp. Feeds the "Sea & beaches" tile.
// Same auth + resilience pattern as pulse-weather.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PULSE_ZONES } from "@/lib/pulse-zones";

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

export const Route = createFileRoute("/api/public/hooks/pulse-marine")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const MarineSchema = z.object({
  zone: z.string(),
  label: z.string(),
  labelEl: z.string(),
  waveHeightM: z.number().nullable(),
  wavePeriodS: z.number().nullable(),
  waveDirection: z.number().nullable(),
  swellHeightM: z.number().nullable(),
  seaTempC: z.number().nullable(),
  summary: z.string(),
  beachVerdict: z.enum(["great", "good", "choppy", "rough"]),
  observedAt: z.string(),
});
type MarineRow = z.infer<typeof MarineSchema>;

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const coastal = PULSE_ZONES.filter((z) => z.coastal);

  const lats = coastal.map((z) => z.lat.toFixed(4)).join(",");
  const lngs = coastal.map((z) => z.lng.toFixed(4)).join(",");

  // Marine API: wave_height + wave_period + wave_direction + swell_wave_height.
  // SST comes from the regular forecast endpoint (sea_surface_temperature is in
  // the marine model but only as hourly), so we batch that separately.
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${lats}&longitude=${lngs}` +
    `&current=wave_height,wave_period,wave_direction,swell_wave_height,sea_surface_temperature` +
    `&timezone=Asia/Nicosia`;

  let payloads: unknown[];
  try {
    const res = await fetch(marineUrl, { headers: { "User-Agent": "Aloya/1.0 (+https://aloya.cy)" } });
    if (!res.ok) return json({ ok: false, error: `Open-Meteo Marine ${res.status}` }, 502);
    const body = (await res.json()) as unknown;
    payloads = Array.isArray(body) ? body : [body];
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }

  const rows: MarineRow[] = [];
  const errors: Array<{ zone: string; error: string }> = [];

  for (let i = 0; i < coastal.length; i++) {
    const z = coastal[i];
    const p = payloads[i] as { current?: Record<string, number> } | undefined;
    const c = p?.current;
    if (!c) {
      errors.push({ zone: z.id, error: "no current block" });
      continue;
    }
    const wave = typeof c.wave_height === "number" ? c.wave_height : null;
    const candidate = {
      zone: z.id,
      label: z.label,
      labelEl: z.labelEl,
      waveHeightM: wave,
      wavePeriodS: typeof c.wave_period === "number" ? c.wave_period : null,
      waveDirection: typeof c.wave_direction === "number" ? c.wave_direction : null,
      swellHeightM: typeof c.swell_wave_height === "number" ? c.swell_wave_height : null,
      seaTempC: typeof c.sea_surface_temperature === "number" ? c.sea_surface_temperature : null,
      summary: summariseSea(wave, c.sea_surface_temperature),
      beachVerdict: beachVerdict(wave),
      observedAt: new Date().toISOString(),
    };
    const parsed = MarineSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ zone: z.id, error: parsed.error.message });
      continue;
    }
    rows.push(parsed.data);
  }

  if (rows.length === 0) return json({ ok: false, error: "no rows", errors }, 502);

  const now = new Date().toISOString();
  const upserts = rows.map((r) => ({
    key: "marine",
    scope: r.zone,
    source: "open-meteo-marine",
    payload: r,
    ttl_seconds: 1800,
    fetched_at: now,
  }));

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(upserts as never, { onConflict: "key,scope" });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, zones: rows.length, errors });
}

function summariseSea(wave: number | null, sst: number | undefined): string {
  if (wave === null) return "Sea data thin right now";
  if (wave < 0.3 && (sst ?? 0) >= 24) return "Glass calm, swim-warm sea";
  if (wave < 0.5) return "Gentle ripples";
  if (wave < 1.0) return "Light chop, fine for swimming";
  if (wave < 1.5) return "Lively swell";
  return "Rough sea, skip the swim";
}

function beachVerdict(wave: number | null): "great" | "good" | "choppy" | "rough" {
  if (wave === null) return "good";
  if (wave < 0.5) return "great";
  if (wave < 1.0) return "good";
  if (wave < 1.5) return "choppy";
  return "rough";
}
