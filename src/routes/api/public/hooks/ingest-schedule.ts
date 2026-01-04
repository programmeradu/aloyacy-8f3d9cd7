// Ingest hook — downloads Cyprus GTFS feeds, builds the same shards as
// scripts/ingest-schedule.ts, and uploads them to the public `schedule`
// Storage bucket. Triggered by pg_cron at 03:00 Cyprus time and callable
// manually for force refresh.
//
// URL: /api/public/hooks/ingest-schedule
// Optional body: { days?: number, force?: boolean }
//
// Auth: requires `apikey` header matching the project anon key (matches our
// other public hooks pattern), OR a Bearer with CRON_SECRET.

import { createFileRoute } from "@tanstack/react-router";
import { unzipSync, gzipSync, strFromU8 } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FEED_IDS = [2, 4, 5, 6, 9, 10, 11];
const BASE = "https://motionbuscard.org.cy/opendata/downloadfile?file=GTFS\\";
const BUCKET = "schedule";

type RouteOut = { short: string; long: string; color: string; feedId: number; type: number };
type ServiceOut = { feedId: number; dates: string[] };
type TripOut = { routeId: string; serviceId: string; direction: 0 | 1; headsign: string; feedId: number };
type StopOut = { name: string; lat: number; lng: number; feedId: number };
type StopTimeRow = [string, number, number, number];
type StopTripRow = [string, number, string];

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",").map((s) => s.trim());
  const rows: string[][] = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) rows[i - 1] = lines[i].split(",");
  return { header, rows };
}
const col = (h: string[], n: string) => {
  const i = h.indexOf(n);
  if (i < 0) throw new Error(`missing column: ${n}`);
  return i;
};
const hms = (s: string) => {
  const [h, m, sec] = s.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
};

async function uploadJson(path: string, data: unknown) {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const gz = gzipSync(bytes, { level: 9 });
  const [a, b] = await Promise.all([
    supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "300",
    }),
    supabaseAdmin.storage.from(BUCKET).upload(`${path}.gz`, gz, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "300",
    }),
  ]);
  if (a.error) throw new Error(`upload ${path}: ${a.error.message}`);
  if (b.error) throw new Error(`upload ${path}.gz: ${b.error.message}`);
  return { raw: bytes.length, gz: gz.length };
}

async function runIngest(days: number): Promise<{ ok: true; trips: number; stops: number; dates: string[]; bytes: number }> {
  const routes: Record<string, RouteOut> = {};
  const services: Record<string, ServiceOut> = {};
  const trips: Record<string, TripOut> = {};
  const stops: Record<string, StopOut> = {};
  const stopTimes: Record<string, StopTimeRow[]> = {};

  for (const feedId of FEED_IDS) {
    const url = `${BASE}${feedId}_google_transit.zip&rel=True`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`download feed ${feedId} → ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(buf, {
      filter: (f) => /\.(txt)$/.test(f.name) && /(stops|routes|calendar_dates|trips|stop_times)\.txt$/.test(f.name),
    });
    const ns = (raw: string) => `${feedId}:${raw}`;
    const txt = (name: string) => {
      const k = Object.keys(files).find((n) => n.endsWith(name));
      if (!k) throw new Error(`feed ${feedId} missing ${name}`);
      return strFromU8(files[k]);
    };

    // stops
    {
      const { header, rows } = parseCsv(txt("stops.txt"));
      const iId = col(header, "stop_id"), iN = col(header, "stop_name"), iLa = col(header, "stop_lat"), iLn = col(header, "stop_lon");
      for (const r of rows) {
        if (!r[iId]) continue;
        const lat = Number(r[iLa]), lng = Number(r[iLn]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        stops[ns(r[iId])] = { name: r[iN] ?? "", lat, lng, feedId };
      }
    }
    // routes
    {
      const { header, rows } = parseCsv(txt("routes.txt"));
      const iId = col(header, "route_id"), iS = col(header, "route_short_name"), iL = col(header, "route_long_name"), iC = header.indexOf("route_color"), iT = col(header, "route_type");
      for (const r of rows) routes[ns(r[iId])] = { short: r[iS] ?? "", long: r[iL] ?? "", color: iC >= 0 ? r[iC] ?? "" : "", feedId, type: Number(r[iT]) };
    }
    // calendar_dates
    {
      const { header, rows } = parseCsv(txt("calendar_dates.txt"));
      const iSv = col(header, "service_id"), iD = col(header, "date"), iE = col(header, "exception_type");
      for (const r of rows) {
        if (r[iE] !== "1") continue;
        const sid = ns(r[iSv]);
        (services[sid] ??= { feedId, dates: [] }).dates.push(r[iD]);
      }
    }
    // trips
    {
      const { header, rows } = parseCsv(txt("trips.txt"));
      const iR = col(header, "route_id"), iSv = col(header, "service_id"), iT = col(header, "trip_id"), iH = col(header, "trip_headsign"), iD = col(header, "direction_id");
      for (const r of rows) trips[ns(r[iT])] = { routeId: ns(r[iR]), serviceId: ns(r[iSv]), direction: (Number(r[iD]) || 0) as 0 | 1, headsign: r[iH] ?? "", feedId };
    }
    // stop_times
    {
      const { header, rows } = parseCsv(txt("stop_times.txt"));
      const iT = col(header, "trip_id"), iA = col(header, "arrival_time"), iD = col(header, "departure_time"), iS = col(header, "stop_id"), iQ = col(header, "stop_sequence");
      for (const r of rows) {
        const tid = ns(r[iT]);
        (stopTimes[tid] ??= []).push([ns(r[iS]), hms(r[iD]), hms(r[iA]), Number(r[iQ])]);
      }
    }
  }

  for (const tid of Object.keys(stopTimes)) stopTimes[tid].sort((a, b) => a[3] - b[3]);

  // global stop -> trips
  const stopTrips: Record<string, StopTripRow[]> = {};
  for (const [tid, list] of Object.entries(stopTimes)) {
    const routeId = trips[tid]?.routeId ?? "";
    for (const [sid, dep] of list) (stopTrips[sid] ??= []).push([tid, dep, routeId]);
  }
  for (const s of Object.keys(stopTrips)) stopTrips[s].sort((a, b) => a[1] - b[1]);

  // dates (Cyprus local; UTC+3 approx)
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + (3 + i * 24) * 3600 * 1000);
    dates.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`);
  }
  const dateSet = new Set(dates);

  const servicesByDate = new Map<string, Set<string>>();
  for (const [sid, svc] of Object.entries(services)) {
    for (const d of svc.dates) {
      if (!dateSet.has(d)) continue;
      let s = servicesByDate.get(d);
      if (!s) { s = new Set(); servicesByDate.set(d, s); }
      s.add(sid);
    }
  }

  let totalBytes = 0;
  const shardIndex: Record<string, { trips: number; rows: number; stopTimesKb: number; stopTripsKb: number }> = {};

  // globals
  const feedsMeta = FEED_IDS.map((id) => ({ id, source: `${BASE}${id}_google_transit.zip&rel=True` }));
  for (const [name, data] of [
    ["feeds.json", feedsMeta],
    ["stops.json", stops],
    ["routes.json", routes],
    ["services.json", services],
    ["trips.json", trips],
  ] as const) {
    const r = await uploadJson(name, data);
    totalBytes += r.raw;
  }

  // per-date shards (one at a time to keep memory bounded)
  for (const date of dates) {
    const active = servicesByDate.get(date) ?? new Set();
    const shardStopTimes: Record<string, StopTimeRow[]> = {};
    const shardStopTrips: Record<string, StopTripRow[]> = {};
    let rowCount = 0;
    for (const [tid, t] of Object.entries(trips)) {
      if (!active.has(t.serviceId)) continue;
      const list = stopTimes[tid];
      if (!list) continue;
      shardStopTimes[tid] = list;
      rowCount += list.length;
      for (const [sid, dep] of list) (shardStopTrips[sid] ??= []).push([tid, dep, t.routeId]);
    }
    for (const s of Object.keys(shardStopTrips)) shardStopTrips[s].sort((a, b) => a[1] - b[1]);
    const stRes = await uploadJson(`by-date/${date}/stop-times.json`, shardStopTimes);
    const trRes = await uploadJson(`by-date/${date}/stop-trips.json`, shardStopTrips);
    shardIndex[date] = {
      trips: Object.keys(shardStopTimes).length,
      rows: rowCount,
      stopTimesKb: Math.round(stRes.raw / 1024),
      stopTripsKb: Math.round(trRes.raw / 1024),
    };
    totalBytes += stRes.raw + trRes.raw;
  }

  await uploadJson("by-date/index.json", shardIndex);

  return { ok: true, trips: Object.keys(trips).length, stops: Object.keys(stops).length, dates, bytes: totalBytes };
}

export const Route = createFileRoute("/api/public/hooks/ingest-schedule")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: anon key in apikey header, or Bearer CRON_SECRET
        const apikey = request.headers.get("apikey");
        const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const validApiKey = apikey && apikey === process.env.SUPABASE_PUBLISHABLE_KEY;
        const validCron = bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
        if (!validApiKey && !validCron) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        let body: { days?: number } = {};
        try { body = (await request.json()) as { days?: number }; } catch { /* ignore */ }
        const days = Math.max(1, Math.min(14, body.days ?? 14));

        const t0 = Date.now();
        try {
          const result = await runIngest(days);
          return new Response(JSON.stringify({ ...result, ms: Date.now() - t0 }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[ingest-schedule] failed:", err);
          return new Response(JSON.stringify({ error: (err as Error).message, ms: Date.now() - t0 }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
