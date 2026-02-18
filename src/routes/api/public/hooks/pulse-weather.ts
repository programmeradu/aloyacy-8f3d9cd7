// Pulse weather feed — pulls Open-Meteo for every Cyprus zone we care about
// and upserts a normalised payload into pulse_signals. Public route under
// /api/public/hooks/ so pg_cron can hit it without auth headaches; guarded by
// the Supabase publishable key in the apikey header (same pattern as the
// other working cron endpoints in this project).

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PULSE_ZONES } from "@/lib/pulse-zones";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey, Authorization, X-Cron-Secret",
};

const QuerySchema = z.object({}).strict();

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
  if (!validApiKey && !validLegacy) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const params = Object.fromEntries(
    [...url.searchParams.entries()].filter(([k]) => k !== "cron_secret"),
  );
  if (!QuerySchema.safeParse(params).success) return json({ ok: false, error: "Bad params" }, 400);
  return null;
}

export const Route = createFileRoute("/api/public/hooks/pulse-weather")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

type WeatherRow = {
  zone: string;
  label: string;
  labelEl: string;
  tempC: number;
  feelsC: number;
  windKph: number;
  windDir: number;
  precipMm: number;
  cloudPct: number;
  humidityPct: number;
  uvIndex: number | null;
  pressureHpa: number | null;
  code: number;        // WMO weather code
  summary: string;     // editorial short
  isDay: boolean;
  sunriseLocal: string | null;
  sunsetLocal: string | null;
  observedAt: string;
};

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const rows: WeatherRow[] = [];
  const errors: Array<{ zone: string; error: string }> = [];

  // Open-Meteo accepts comma-separated coords for batched pulls — one request,
  // every zone, minimal latency.
  const lats = PULSE_ZONES.map((z) => z.lat.toFixed(4)).join(",");
  const lngs = PULSE_ZONES.map((z) => z.lng.toFixed(4)).join(",");
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lats}&longitude=${lngs}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,` +
    `precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,uv_index` +
    `&daily=sunrise,sunset` +
    `&timezone=Asia/Nicosia&wind_speed_unit=kmh`;

  let payloads: unknown[];
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Aloya/1.0 (+https://aloya.cy)" } });
    if (!res.ok) return json({ ok: false, error: `Open-Meteo ${res.status}` }, 502);
    const body = (await res.json()) as unknown;
    payloads = Array.isArray(body) ? body : [body];
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }

  for (let i = 0; i < PULSE_ZONES.length; i++) {
    const z = PULSE_ZONES[i];
    const p = payloads[i] as
      | {
          current?: Record<string, number>;
          daily?: { sunrise?: string[]; sunset?: string[] };
        }
      | undefined;
    const c = p?.current;
    if (!c) {
      errors.push({ zone: z.id, error: "no current block" });
      continue;
    }
    rows.push({
      zone: z.id,
      label: z.label,
      labelEl: z.labelEl,
      tempC: c.temperature_2m,
      feelsC: c.apparent_temperature,
      windKph: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      precipMm: c.precipitation,
      cloudPct: c.cloud_cover,
      humidityPct: c.relative_humidity_2m,
      uvIndex: typeof c.uv_index === "number" ? c.uv_index : null,
      pressureHpa: typeof c.pressure_msl === "number" ? c.pressure_msl : null,
      code: c.weather_code,
      isDay: Boolean(c.is_day),
      sunriseLocal: p.daily?.sunrise?.[0] ?? null,
      sunsetLocal: p.daily?.sunset?.[0] ?? null,
      summary: summarise(c.weather_code, c.temperature_2m, c.precipitation, c.wind_speed_10m),
      observedAt: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return json({ ok: false, error: "no rows", errors }, 502);

  // One row per zone for fine-grained reads, plus a single rolled-up "island"
  // payload for the headline card.
  const upserts = rows.map((r) => ({
    key: "weather",
    scope: r.zone,
    source: "open-meteo",
    payload: r,
    ttl_seconds: 1800,
    fetched_at: new Date().toISOString(),
  }));
  upserts.push({
    key: "weather",
    scope: "island",
    source: "open-meteo",
    payload: { zones: rows, observedAt: new Date().toISOString() },
    ttl_seconds: 1800,
    fetched_at: new Date().toISOString(),
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(upserts, { onConflict: "key,scope" });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, zones: rows.length, errors });
}

/** Short editorial line from raw weather numbers. Keep tone calm + concrete. */
function summarise(code: number, t: number, precip: number, wind: number): string {
  // WMO code groupings.
  if (precip > 4) return "Steady rain";
  if (precip > 0.5) return "Showers passing through";
  if (code >= 95) return "Thunderstorms";
  if (code >= 71) return "Snow on the mountains";
  if (code >= 61) return "Rain rolling in";
  if (code >= 45) return "Low cloud and haze";
  if (wind >= 35) return "Brisk wind picking up";
  if (t >= 36) return "Heatwave conditions";
  if (t >= 30) return "Hot and bright";
  if (code === 0) return "Clear and settled";
  if (code <= 2) return "Mostly clear";
  return "Quiet sky";
}
