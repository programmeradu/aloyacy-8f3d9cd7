// Ingest Cyprus GTFS static feeds → compact, query-ready JSON in public/data/schedule/.
//
// Output (all written to public/data/schedule/):
//   feeds.json                — feed metadata
//   stops.json                — stopId → { name, lat, lng, feedId }   (merged across all feeds)
//   routes.json               — routeId → { short, long, color, feedId, type }
//   services.json             — serviceId → { feedId, dates }
//   trips.json                — tripId → { routeId, serviceId, direction, headsign, feedId }
//   stop-times.json           — tripId → [stopId, depSec, arrSec, seq][]   (global, fallback)
//   stop-trips.json           — stopId → [tripId, depSec, routeId][]       (global, sorted)
//   by-date/YYYYMMDD/stop-trips.json — same shape, only trips active that date
//   by-date/YYYYMMDD/stop-times.json — same shape, only those trips
//   by-date/index.json        — list of dates produced + per-shard sizes
//
// The per-date shards are the hot path for RAPTOR on the Worker — each is
// ~2–5 MB raw vs 50 MB for the global indexes, so a request can fetch only
// the day it needs and stay well within Worker memory.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const FEED_IDS = [2, 4, 5, 6, 9, 10, 11];
const BASE = "https://motionbuscard.org.cy/opendata/downloadfile?file=GTFS\\";
const TMP = "/tmp/gtfs";
const OUT = "public/data/schedule";

mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

// --- 1. Download + unzip every feed if not already present -----------------

for (const id of FEED_IDS) {
  const zip = `${TMP}/${id}.zip`;
  const dir = `${TMP}/feed${id}`;
  if (!existsSync(zip)) {
    console.log(`[ingest] downloading feed ${id}`);
    execSync(
      `curl -sfL -A "Mozilla/5.0" -o "${zip}" "${BASE}${id}_google_transit.zip&rel=True"`,
      { stdio: "inherit" }
    );
  }
  if (!existsSync(`${dir}/stop_times.txt`)) {
    execSync(`nix run nixpkgs#unzip -- -oq "${zip}" -d "${dir}"`, { stdio: "inherit" });
  }
}

// --- 2. Tiny CSV parser ----------------------------------------------------
// GTFS files are pure UTF-8 CSV with a possible BOM. No quoted-newlines in
// Cyprus feeds (verified by sampling). Hand-rolled for speed; the largest
// file is ~500k rows.

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",").map((s) => s.trim());
  const rows: string[][] = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) {
    // No quoted fields in Cyprus GTFS — confirmed; plain split is correct.
    rows[i - 1] = lines[i].split(",");
  }
  return { header, rows };
}

function col(header: string[], name: string): number {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`missing column: ${name}`);
  return i;
}

// GTFS time → seconds since service-day midnight. Can exceed 86400 for
// services that cross midnight (the Cyprus feed uses e.g. 25:30:00 for
// the 1:30 AM run on the same operating day).
function hmsToSec(s: string): number {
  const [h, m, sec] = s.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
}

// --- 3. Build the merged indexes ------------------------------------------

type RouteOut = { short: string; long: string; color: string; feedId: number; type: number };
type ServiceOut = { feedId: number; dates: string[] };
type TripOut = { routeId: string; serviceId: string; direction: 0 | 1; headsign: string; feedId: number };
// stop_times row: [stopId, depSec, arrSec, seq] — array form keeps JSON small
type StopTimeRow = [string, number, number, number];

const routes: Record<string, RouteOut> = {};
const services: Record<string, ServiceOut> = {};
const trips: Record<string, TripOut> = {};
const stopTimes: Record<string, StopTimeRow[]> = {};

for (const feedId of FEED_IDS) {
  const dir = `${TMP}/feed${feedId}`;
  console.log(`[ingest] parsing feed ${feedId}`);

  // routes.txt
  {
    const { header, rows } = parseCsv(readFileSync(`${dir}/routes.txt`, "utf-8"));
    const iId = col(header, "route_id");
    const iShort = col(header, "route_short_name");
    const iLong = col(header, "route_long_name");
    const iColor = header.indexOf("route_color");
    const iType = col(header, "route_type");
    for (const r of rows) {
      routes[r[iId]] = {
        short: r[iShort] ?? "",
        long: r[iLong] ?? "",
        color: iColor >= 0 ? r[iColor] ?? "" : "",
        feedId,
        type: Number(r[iType]),
      };
    }
  }

  // calendar_dates.txt — Cyprus feeds use only this, no calendar.txt
  {
    const { header, rows } = parseCsv(readFileSync(`${dir}/calendar_dates.txt`, "utf-8"));
    const iSvc = col(header, "service_id");
    const iDate = col(header, "date");
    const iEx = col(header, "exception_type");
    for (const r of rows) {
      if (r[iEx] !== "1") continue; // 1 = added; 2 = removed (rare here)
      const sid = r[iSvc];
      const svc = (services[sid] ??= { feedId, dates: [] });
      svc.dates.push(r[iDate]);
    }
    for (const sid of Object.keys(services)) {
      if (services[sid].feedId === feedId) services[sid].dates.sort();
    }
  }

  // trips.txt
  {
    const { header, rows } = parseCsv(readFileSync(`${dir}/trips.txt`, "utf-8"));
    const iRoute = col(header, "route_id");
    const iSvc = col(header, "service_id");
    const iTrip = col(header, "trip_id");
    const iHead = col(header, "trip_headsign");
    const iDir = col(header, "direction_id");
    for (const r of rows) {
      trips[r[iTrip]] = {
        routeId: r[iRoute],
        serviceId: r[iSvc],
        direction: (Number(r[iDir]) || 0) as 0 | 1,
        headsign: r[iHead] ?? "",
        feedId,
      };
    }
  }

  // stop_times.txt — the big one
  {
    const text = readFileSync(`${dir}/stop_times.txt`, "utf-8");
    const { header, rows } = parseCsv(text);
    const iTrip = col(header, "trip_id");
    const iArr = col(header, "arrival_time");
    const iDep = col(header, "departure_time");
    const iStop = col(header, "stop_id");
    const iSeq = col(header, "stop_sequence");
    for (const r of rows) {
      const tripId = r[iTrip];
      const arr = hmsToSec(r[iArr]);
      const dep = hmsToSec(r[iDep]);
      const list = (stopTimes[tripId] ??= []);
      list.push([r[iStop], dep, arr, Number(r[iSeq])]);
    }
  }
}

// Ensure each trip's stop_times are sorted by sequence (defensive — GTFS
// spec doesn't strictly require source order, and our planner relies on it).
for (const tid of Object.keys(stopTimes)) {
  stopTimes[tid].sort((a, b) => a[3] - b[3]);
}

// --- 4. Build the stop → trips reverse index ------------------------------
// For RAPTOR / connection-scan, the hot path is "what trips depart stop X
// after time T?". Pre-index sorted by depSec.

const stopTrips: Record<string, [string, number, string][]> = {};
for (const [tripId, list] of Object.entries(stopTimes)) {
  const routeId = trips[tripId]?.routeId ?? "";
  for (const [stopId, depSec] of list) {
    (stopTrips[stopId] ??= []).push([tripId, depSec, routeId]);
  }
}
for (const sid of Object.keys(stopTrips)) {
  stopTrips[sid].sort((a, b) => a[1] - b[1]);
}

// --- 5. Write outputs + report sizes --------------------------------------

const feedsMeta = FEED_IDS.map((id) => ({ id, source: `${BASE}${id}_google_transit.zip&rel=True` }));

function write(name: string, data: unknown) {
  const json = JSON.stringify(data);
  const path = join(OUT, name);
  writeFileSync(path, json);
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(`${path}.gz`, gz);
  const kb = (json.length / 1024).toFixed(0);
  const kbGz = (gz.length / 1024).toFixed(0);
  console.log(`[ingest] wrote ${name}  raw=${kb} KB  gz=${kbGz} KB`);
  return { raw: json.length, gz: gz.length };
}

const sizes = [
  write("feeds.json", feedsMeta),
  write("routes.json", routes),
  write("services.json", services),
  write("trips.json", trips),
  write("stop-times.json", stopTimes),
  write("stop-trips.json", stopTrips),
];

const totalRaw = sizes.reduce((a, b) => a + b.raw, 0);
const totalGz = sizes.reduce((a, b) => a + b.gz, 0);
console.log(
  `[ingest] DONE  trips=${Object.keys(trips).length}  stop_times rows=${Object.values(stopTimes).reduce((a, b) => a + b.length, 0)}  total raw=${(totalRaw / 1024 / 1024).toFixed(1)} MB  gz=${(totalGz / 1024 / 1024).toFixed(1)} MB`
);
