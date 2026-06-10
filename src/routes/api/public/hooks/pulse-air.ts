// Pulse air-quality feed — Open-Meteo Air Quality. PM2.5, PM10 (Saharan dust),
// ozone, NO2, European AQI. Cyprus gets dust storms several times a year;
// this drives the "dusty" theme override and covered-wait advice.

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

export const Route = createFileRoute("/api/public/hooks/pulse-air")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

const AirSchema = z.object({
  zone: z.string(),
  label: z.string(),
  labelEl: z.string(),
  pm25: z.number().nullable(),
  pm10: z.number().nullable(),
  ozone: z.number().nullable(),
  no2: z.number().nullable(),
  europeanAqi: z.number().nullable(),
  band: z.enum(["good", "fair", "moderate", "poor", "very-poor"]),
  dustAlert: z.boolean(),
  summary: z.string(),
  observedAt: z.string(),
});
type AirRow = z.infer<typeof AirSchema>;

async function ingest() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const lats = PULSE_ZONES.map((z) => z.lat.toFixed(4)).join(",");
  const lngs = PULSE_ZONES.map((z) => z.lng.toFixed(4)).join(",");

  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lats}&longitude=${lngs}` +
    `&current=pm10,pm2_5,ozone,nitrogen_dioxide,european_aqi` +
    `&timezone=Asia/Nicosia`;

  let payloads: unknown[];
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Aloya/1.0 (+https://aloya.cy)" } });
    if (!res.ok) return json({ ok: false, error: `Open-Meteo AQ ${res.status}` }, 502);
    const body = (await res.json()) as unknown;
    payloads = Array.isArray(body) ? body : [body];
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }

  const rows: AirRow[] = [];
  const errors: Array<{ zone: string; error: string }> = [];

  for (let i = 0; i < PULSE_ZONES.length; i++) {
    const z = PULSE_ZONES[i];
    const p = payloads[i] as { current?: Record<string, number> } | undefined;
    const c = p?.current;
    if (!c) {
      errors.push({ zone: z.id, error: "no current block" });
      continue;
    }
    const pm10 = typeof c.pm10 === "number" ? c.pm10 : null;
    const pm25 = typeof c.pm2_5 === "number" ? c.pm2_5 : null;
    const aqi = typeof c.european_aqi === "number" ? c.european_aqi : null;
    const candidate = {
      zone: z.id,
      label: z.label,
      labelEl: z.labelEl,
      pm25,
      pm10,
      ozone: typeof c.ozone === "number" ? c.ozone : null,
      no2: typeof c.nitrogen_dioxide === "number" ? c.nitrogen_dioxide : null,
      europeanAqi: aqi,
      band: aqiBand(aqi),
      // Saharan dust trigger: WHO daily PM10 guideline is 45 µg/m³.
      // > 80 means a clear dust episode worth surfacing.
      dustAlert: (pm10 ?? 0) >= 80,
      summary: summariseAir(aqi, pm10),
      observedAt: new Date().toISOString(),
    };
    const parsed = AirSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ zone: z.id, error: parsed.error.message });
      continue;
    }
    rows.push(parsed.data);
  }

  if (rows.length === 0) return json({ ok: false, error: "no rows", errors }, 502);

  const now = new Date().toISOString();
  const upserts = rows.map((r) => ({
    key: "air",
    scope: r.zone,
    source: "open-meteo-air",
    payload: r,
    ttl_seconds: 3600,
    fetched_at: now,
  }));
  // Island rollup — worst zone wins (so the headline tile reflects the dust front).
  const worst = rows.reduce((a, b) => ((b.europeanAqi ?? 0) > (a.europeanAqi ?? 0) ? b : a));
  upserts.push({
    key: "air",
    scope: "island",
    source: "open-meteo-air",
    payload: { worst, zones: rows, observedAt: now } as unknown as AirRow,
    ttl_seconds: 3600,
    fetched_at: now,
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(upserts as never, { onConflict: "key,scope" });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({
    ok: true,
    zones: rows.length,
    dustAlerts: rows.filter((r) => r.dustAlert).map((r) => r.zone),
    errors,
  });
}

function aqiBand(aqi: number | null): "good" | "fair" | "moderate" | "poor" | "very-poor" {
  if (aqi === null) return "fair";
  if (aqi <= 20) return "good";
  if (aqi <= 40) return "fair";
  if (aqi <= 60) return "moderate";
  if (aqi <= 80) return "poor";
  return "very-poor";
}

function summariseAir(aqi: number | null, pm10: number | null): string {
  if ((pm10 ?? 0) >= 150) return "Heavy Saharan dust, mask up if sensitive";
  if ((pm10 ?? 0) >= 80) return "Saharan dust drifting in";
  if (aqi === null) return "Air monitor offline";
  if (aqi <= 20) return "Crisp, clean air";
  if (aqi <= 40) return "Fair air, comfortable";
  if (aqi <= 60) return "Moderate, mild haze";
  if (aqi <= 80) return "Poor air, limit exertion outdoors";
  return "Very poor air, stay indoors if sensitive";
}
