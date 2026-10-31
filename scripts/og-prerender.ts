// Build-time share card assets, written into dist/client/og/.
//
// Cards are drawn per link at run time by the Worker (Workers Paid, see
// src/lib/og-runtime.server.ts) and cached. This script only writes what the
// Worker reads and the fallbacks it serves if drawing ever fails:
//
//   og/network.json            whole island geometry (all city feeds) for run time drawing
//   og/trips/<shard>.json      GTFS trip id -> [routeId, "HH:MM", from, to, line number]
//   og/near/<i>_<j>.json       stops per 0.05 degree cell, for "nearest stop"
//   og/default.png lines.png pulse.png pass.png saved.png planner.png
//   og/trip.png group.png plan.png airport/<code>.png   static fallbacks
//
// Run: node .og-prerender.mjs [outDir] [--shard i/n]
// (bundled with esbuild in CI; see .github/workflows/deploy-newacct.yml)

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { initWasm } from "@resvg/resvg-wasm";
import sharp from "sharp";
import {
  airportCard,
  defaultCard,
  tripCard,
  genericGroupCard,
  genericPlanCard,
  networkCard,
  pulseCard,
  passCard,
  savedCard,
  plannerCard,
} from "@/lib/og-roam-cards.server";
import { renderPng, setOgNetwork, type Shapes } from "@/lib/og-roam.server";
import { ROUTES, STOPS, getRoute, getStop } from "@/lib/gtfs";
import { tripShard, TRIP_SHARDS, nearCell } from "@/lib/og-asset";
import { loadOgNetwork } from "./og-gtfs";

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith("--")) ?? "dist/client/og";
const si = args.indexOf("--shard");
const [shard, shards] = si >= 0 ? args[si + 1].split("/").map(Number) : [0, 1];
const mine = (k: number) => k % shards === shard;

export const AIRPORT_STOPS: Record<string, string> = { lca: "6117", pfo: "1813" };

async function main() {
  const require = createRequire(import.meta.url);
  await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
  (globalThis as { __aloya_resvg_ready?: Promise<void> }).__aloya_resvg_ready = Promise.resolve();

  const shapes = JSON.parse(readFileSync("public/gtfs-shapes.json", "utf8")) as Shapes &
    Record<string, { trips?: Record<string, unknown> }>;
  const routeIds = [...new Set(ROUTES.map((r) => r.id))].filter((id) =>
    /^[A-Za-z0-9_-]{1,32}$/.test(id),
  );
  let net: ReturnType<typeof loadOgNetwork> | null = null;
  try {
    net = loadOgNetwork(new Set(routeIds));
    for (const [rid, v] of Object.entries(net.shapes))
      if (!shapes[rid]?.shapes) shapes[rid] = { ...(shapes[rid] ?? {}), shapes: v.shapes };
    setOgNetwork(net);
  } catch (e) {
    console.warn(`og: island network unavailable, Nicosia data only: ${(e as Error).message}`);
  }

  let n = 0;
  let k = 0;
  const job = async (rel: string, draw: () => string) => {
    if (!mine(k++)) return;
    const png = await sharp(await renderPng(draw()))
      .png({ palette: true, quality: 90, colours: 192, effort: 7, compressionLevel: 9 })
      .toBuffer();
    const f = join(out, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, png);
    n++;
  };
  await job("default.png", () => defaultCard(shapes));
  await job("trip.png", () => tripCard(null, shapes));
  await job("group.png", () => genericGroupCard(shapes));
  await job("plan.png", () => genericPlanCard(shapes));
  await job("lines.png", () => networkCard(shapes));
  await job("pulse.png", () => pulseCard(shapes));
  await job("pass.png", () => passCard(shapes));
  await job("saved.png", () => savedCard(shapes));
  await job("planner.png", () => plannerCard(shapes));
  for (const [code, stop] of Object.entries(AIRPORT_STOPS))
    await job(`airport/${code}.png`, () => airportCard(code, stop, shapes));

  if (shard !== 0) {
    console.log(`og: shard ${shard}/${shards} done, ${n} cards`);
    return;
  }

  // Trip id -> [route id, first departure, first stop, last stop, line number].
  const index: Record<string, string[]>[] = Array.from({ length: TRIP_SHARDS }, () => ({}));
  const nameOf = (id: string, rid: string) => getStop(id, getRoute(rid)?.agency)?.name ?? "";
  if (net)
    for (const [tid, [rid, dep, a, b]] of Object.entries(net.trips))
      index[tripShard(tid)][tid] = [rid, dep, nameOf(a, rid), nameOf(b, rid), getRoute(rid)?.short ?? ""];
  for (const [rid, v] of Object.entries(shapes))
    for (const tid of Object.keys(v.trips ?? {}))
      if (!index[tripShard(tid)][tid])
        index[tripShard(tid)][tid] = [rid, "", "", "", getRoute(rid)?.short ?? ""];
  mkdirSync(join(out, "trips"), { recursive: true });
  index.forEach((s, i) => writeFileSync(join(out, "trips", `${i}.json`), JSON.stringify(s)));

  // Stops by cell. The card for a stop id is the first stop with that id.
  const cells = new Map<string, [string, number, number][]>();
  for (const s of STOPS) {
    if (getStop(s.id) !== s || !/^[A-Za-z0-9_-]{1,32}$/.test(s.id)) continue;
    const c = nearCell(s.lat, s.lng);
    let a = cells.get(c);
    if (!a) cells.set(c, (a = []));
    a.push([s.id, Number(s.lat.toFixed(5)), Number(s.lng.toFixed(5))]);
  }
  mkdirSync(join(out, "near"), { recursive: true });
  for (const [c, a] of cells) writeFileSync(join(out, "near", `${c}.json`), JSON.stringify(a));

  if (net) {
    const body = JSON.stringify({ shapes: net.shapes, seq: net.seq, routeStops: net.routeStops });
    writeFileSync(join(out, "network.json"), body);
    console.log(`og: network.json ${(body.length / 1e6).toFixed(2)} MB`);
  }
  console.log(`og: done, ${n} fallback cards, ${cells.size} near cells`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
