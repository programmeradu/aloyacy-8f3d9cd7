// Pre-render every Roam share card at build time into dist/client/og/.
//
// Why: on the Workers free plan a request gets ~10 ms of CPU, and drawing a
// 1200 x 630 map card with resvg takes hundreds. Rendering on request tripped
// error 1102 and took the whole worker down for a while. So CI (plenty of CPU)
// draws the cards once per deploy and the /api/public/og/* endpoints only hand
// back the matching static file.
//
//   og/default.png            home and generic pages
//   og/stop/<stopId>.png      every stop in the static GTFS
//   og/line/<routeId>.png     every route
//   og/trip.png group.png plan.png   generic cards for things that only
//                             exist at run time (a rider's trip, a group, a plan)
//   og/trips/<shard>.json     GTFS trip id -> route id, sharded so the worker
//                             parses a few KB, never the whole index
//
// Run: node dist-scripts/og-prerender.mjs [outDir] [--limit N]
// (bundled with esbuild in CI; see .github/workflows/deploy-newacct.yml)

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { initWasm } from "@resvg/resvg-wasm";
import {
  defaultCard,
  stopCard,
  lineCard,
  tripCard,
  groupCard,
  planCard,
} from "@/lib/og-roam-cards.server";
import { renderPng, type Shapes } from "@/lib/og-roam.server";
import { ROUTES, STOPS } from "@/lib/gtfs";
import { tripShard, TRIP_SHARDS } from "@/lib/og-asset";

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--")) ?? "dist/client/og";
const li = args.indexOf("--limit");
const limit = li >= 0 ? Number(args[li + 1]) : Infinity;

async function main() {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@resvg/resvg-wasm/index_bg.wasm");
  await initWasm(readFileSync(wasmPath));
  (globalThis as { __aloya_resvg_ready?: Promise<void> }).__aloya_resvg_ready = Promise.resolve();

  const shapes = JSON.parse(readFileSync("public/gtfs-shapes.json", "utf8")) as Shapes &
    Record<string, { trips?: Record<string, unknown> }>;

  let n = 0;
  let bytes = 0;
  const t0 = Date.now();
  const put = async (rel: string, svg: string) => {
    const png = await renderPng(svg);
    const f = join(out, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, png);
    n++;
    bytes += png.byteLength;
    if (n % 250 === 0) console.log(`og: ${n} cards, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  };

  await put("default.png", defaultCard(shapes));
  await put("trip.png", tripCard(null, shapes));
  await put(
    "group.png",
    groupCard({ code: null, destination: null, host: null, members: 0, arrived: 0, nextEta: null, place: null }, shapes),
  );
  await put("plan.png", planCard(
      { origin: null, destination: null, creator: null, depart: null, arrive: null, day: null, duration: null, transfers: 0, legs: [] },
      shapes,
    ));

  const routeIds = [...new Set(ROUTES.map((r) => r.id))].filter((id) => /^[A-Za-z0-9_-]{1,32}$/.test(id));
  for (const id of routeIds.slice(0, limit)) await put(`line/${id}.png`, lineCard(id, shapes));

  const stopIds = [...new Set(STOPS.map((s) => s.id))].filter((id) => /^[A-Za-z0-9_-]{1,32}$/.test(id));
  for (const id of stopIds.slice(0, limit)) await put(`stop/${id}.png`, stopCard(id, shapes));

  // Trip id -> route id, sharded.
  const shards: Record<string, string>[] = Array.from({ length: TRIP_SHARDS }, () => ({}));
  for (const [rid, v] of Object.entries(shapes)) {
    for (const tid of Object.keys(v.trips ?? {})) shards[tripShard(tid)][tid] = rid;
  }
  mkdirSync(join(out, "trips"), { recursive: true });
  shards.forEach((s, i) => writeFileSync(join(out, "trips", `${i}.json`), JSON.stringify(s)));

  console.log(`og: done, ${n} cards, ${(bytes / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
