// Pulse traffic feed — CyNAP DATEX II v2.3 ingest.
//
// Cyprus' National Access Point (traffic4cyprus.org.cy) publishes road
// closures, roadworks and incidents in DATEX II XML. The feed is access-
// controlled (registration-gated), so we leave the URL + auth header
// configurable via env. The route degrades gracefully when not configured:
// it returns `{ ok: true, configured: false }` so cron stays healthy and
// the rest of Pulse keeps working.
//
// Output: rows in `pulse_signals` (key='traffic'), one row per editorial
// zone (nicosia/limassol/larnaca/paphos/famagusta) + an `island` rollup.
// Each row's payload is a `TrafficPayload` (see below) — a typed, capped
// list of fresh incidents nearest that zone.

import { createFileRoute } from "@tanstack/react-router";
import { XMLParser } from "fast-xml-parser";
import { nearestZone, PULSE_ZONES, type PulseZone } from "@/lib/pulse-zones";

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

export const Route = createFileRoute("/api/public/hooks/pulse-traffic")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => (await guard(request)) ?? ingest(),
      POST: async ({ request }) => (await guard(request)) ?? ingest(),
    },
  },
});

// ───────────────────────── Types ─────────────────────────

export type TrafficIncident = {
  id: string;
  kind: "roadworks" | "closure" | "accident" | "congestion" | "weather" | "other";
  severity: "low" | "medium" | "high";
  road: string | null;
  headline: string;
  lat: number | null;
  lng: number | null;
  zone: PulseZone | null;
  validFrom: string | null;
  validTo: string | null;
};

export type TrafficPayload = {
  zone: PulseZone | "island";
  count: number;
  highest: "low" | "medium" | "high";
  incidents: TrafficIncident[];
  observedAt: string;
};

// ─────────────────────── Ingest ──────────────────────────

async function ingest() {
  const url = process.env.DATEX_CY_URL;
  if (!url) {
    return json({ ok: true, configured: false, note: "DATEX_CY_URL not set" });
  }

  const headers: Record<string, string> = {
    "User-Agent": "Aloya/1.0 (+https://aloya.cy)",
    Accept: "application/xml, text/xml;q=0.9, */*;q=0.1",
  };
  if (process.env.DATEX_CY_AUTH) headers.Authorization = process.env.DATEX_CY_AUTH;

  let xml: string;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return json({ ok: false, error: `DATEX ${res.status}` }, 502);
    xml = await res.text();
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }

  let incidents: TrafficIncident[];
  try {
    incidents = parseDatex(xml);
  } catch (e) {
    return json({ ok: false, error: `parse: ${(e as Error).message}` }, 502);
  }

  const now = new Date().toISOString();
  const byZone = new Map<PulseZone, TrafficIncident[]>();
  for (const inc of incidents) {
    if (inc.lat == null || inc.lng == null) continue;
    const z = nearestZone(inc.lat, inc.lng);
    inc.zone = z.id;
    const arr = byZone.get(z.id) ?? [];
    arr.push(inc);
    byZone.set(z.id, arr);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const upserts: Array<{
    key: string;
    scope: string;
    source: string;
    payload: TrafficPayload;
    ttl_seconds: number;
    fetched_at: string;
  }> = [];

  for (const z of PULSE_ZONES) {
    const list = (byZone.get(z.id) ?? []).slice(0, 12);
    upserts.push({
      key: "traffic",
      scope: z.id,
      source: "cynap-datex",
      payload: {
        zone: z.id,
        count: list.length,
        highest: highestSeverity(list),
        incidents: list,
        observedAt: now,
      },
      ttl_seconds: 1800,
      fetched_at: now,
    });
  }

  const all = incidents.filter((i) => i.lat != null).slice(0, 24);
  upserts.push({
    key: "traffic",
    scope: "island",
    source: "cynap-datex",
    payload: {
      zone: "island",
      count: all.length,
      highest: highestSeverity(all),
      incidents: all,
      observedAt: now,
    },
    ttl_seconds: 1800,
    fetched_at: now,
  });

  const { error } = await supabaseAdmin
    .from("pulse_signals")
    .upsert(upserts as never, { onConflict: "key,scope" });

  if (error) return json({ ok: false, error: error.message }, 500);

  return json({
    ok: true,
    configured: true,
    total: incidents.length,
    placed: incidents.length - incidents.filter((i) => i.lat == null).length,
    byZone: Object.fromEntries(
      PULSE_ZONES.map((z) => [z.id, (byZone.get(z.id) ?? []).length] as const),
    ),
  });
}

// ─────────────────────── Parser ──────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: true,
});

type AnyNode = Record<string, unknown>;

function parseDatex(xml: string): TrafficIncident[] {
  const doc = parser.parse(xml) as AnyNode;
  const situations = collectSituations(doc);
  const out: TrafficIncident[] = [];
  for (const s of situations) {
    const sit = s as AnyNode;
    const id = String(sit["@_id"] ?? sit.id ?? cryptoRandom());
    const records = toArray(
      (sit.situationRecord as unknown) ??
        ((sit.situationRecords as AnyNode | undefined)?.situationRecord as unknown),
    );
    for (const rec of records) {
      const r = rec as AnyNode;
      const recId = String(r["@_id"] ?? `${id}-${out.length}`);
      const kind = classifyKind(r);
      const severity = classifySeverity(r);
      const [lat, lng] = extractPoint(r);
      const validity = (r.validity as AnyNode | undefined)?.validityTimeSpecification as
        | AnyNode
        | undefined;
      const headline = extractHeadline(r) ?? "Traffic event reported";
      const road = extractRoad(r);
      out.push({
        id: recId,
        kind,
        severity,
        road,
        headline,
        lat,
        lng,
        zone: null,
        validFrom: (validity?.overallStartTime as string | undefined) ?? null,
        validTo: (validity?.overallEndTime as string | undefined) ?? null,
      });
    }
  }
  return out;
}

function collectSituations(doc: AnyNode): unknown[] {
  // DATEX II nests: payloadPublication > situation[] (or situations.situation)
  const root =
    (doc.d2LogicalModel as AnyNode | undefined) ??
    (doc.messageContainer as AnyNode | undefined) ??
    doc;
  const payload =
    ((root.payloadPublication as AnyNode | undefined) ??
      ((root.payload as AnyNode | undefined)?.payloadPublication as AnyNode | undefined)) ??
    root;
  const sits =
    (payload?.situation as unknown) ??
    ((payload?.situations as AnyNode | undefined)?.situation as unknown);
  return toArray(sits);
}

function toArray(x: unknown): unknown[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function classifyKind(r: AnyNode): TrafficIncident["kind"] {
  const t = String(r["@_xsi:type"] ?? r["@_type"] ?? "").toLowerCase();
  if (t.includes("roadwork") || t.includes("maintenanceworks")) return "roadworks";
  if (t.includes("closure") || t.includes("roadblockage")) return "closure";
  if (t.includes("accident")) return "accident";
  if (t.includes("congestion") || t.includes("abnormaltraffic")) return "congestion";
  if (t.includes("weather") || t.includes("poorenvironment")) return "weather";
  return "other";
}

function classifySeverity(r: AnyNode): TrafficIncident["severity"] {
  const s = String(r.severity ?? r.impact ?? "").toLowerCase();
  if (s.includes("high") || s.includes("serious")) return "high";
  if (s.includes("low") || s.includes("none")) return "low";
  if (s.includes("medium")) return "medium";
  const probability = String(r.probabilityOfOccurrence ?? "").toLowerCase();
  if (probability.includes("certain")) return "high";
  return "medium";
}

function extractPoint(r: AnyNode): [number | null, number | null] {
  const loc =
    (r.groupOfLocations as AnyNode | undefined) ??
    (r.location as AnyNode | undefined) ??
    {};
  const point =
    (loc.locationContainedInGroup as AnyNode | undefined) ??
    (loc.alertCPoint as AnyNode | undefined) ??
    loc;
  const coords =
    (point.pointCoordinates as AnyNode | undefined) ??
    ((point.pointByCoordinates as AnyNode | undefined)?.pointCoordinates as AnyNode | undefined);
  const lat = numberOrNull(coords?.latitude);
  const lng = numberOrNull(coords?.longitude);
  if (lat == null || lng == null) return [null, null];
  if (lat < 34 || lat > 36 || lng < 32 || lng > 35) return [null, null];
  return [lat, lng];
}

function extractHeadline(r: AnyNode): string | null {
  const comments =
    (r.generalPublicComment as AnyNode | undefined) ??
    (r.nonGeneralPublicComment as AnyNode | undefined) ??
    {};
  const desc = (comments.comment as AnyNode | undefined) ?? (comments as AnyNode);
  const values = (desc?.values as AnyNode | undefined)?.value;
  if (typeof values === "string") return values.trim().slice(0, 240);
  if (Array.isArray(values)) {
    const v = values.find((x) => typeof x === "string") as string | undefined;
    if (v) return v.trim().slice(0, 240);
    const obj = values.find((x) => typeof (x as AnyNode)?.["#text"] === "string") as
      | AnyNode
      | undefined;
    if (obj) return String(obj["#text"]).trim().slice(0, 240);
  }
  if (typeof (values as AnyNode | undefined)?.["#text"] === "string") {
    return String((values as AnyNode)["#text"]).trim().slice(0, 240);
  }
  return null;
}

function extractRoad(r: AnyNode): string | null {
  const loc =
    (r.groupOfLocations as AnyNode | undefined) ??
    (r.location as AnyNode | undefined) ??
    {};
  const v =
    (loc.roadName as AnyNode | string | undefined) ??
    (loc.roadNumber as AnyNode | string | undefined);
  if (!v) return null;
  if (typeof v === "string") return v;
  const text = (v as AnyNode)["#text"];
  return typeof text === "string" ? text : null;
}

function numberOrNull(x: unknown): number | null {
  const n = typeof x === "string" ? Number(x) : typeof x === "number" ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

function highestSeverity(list: TrafficIncident[]): "low" | "medium" | "high" {
  if (list.some((i) => i.severity === "high")) return "high";
  if (list.some((i) => i.severity === "medium")) return "medium";
  return "low";
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}
