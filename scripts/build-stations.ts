// Generates `src/data/stations.json` from the bundled GTFS stop list.
//
// Run with:  bun scripts/build-stations.ts [--report]
//
// The `--report` flag prints every multi-bay station it produced so a human
// can eyeball the merges before they ship. Nothing is merged by hand: the
// clustering rules live in `@aloya/core/stations` and are unit-tested.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildStations, toStationsFile, type StationStopInput } from "../packages/core/src/stations";

const root = path.resolve(import.meta.dirname, "..");
const stopsPath = path.join(root, "src/data/stops.json");
const outPath = path.join(root, "src/data/stations.json");

const stops = JSON.parse(readFileSync(stopsPath, "utf8")) as StationStopInput[];
const index = buildStations(stops);
const file = toStationsFile(index, stops.length);

writeFileSync(outPath, `${JSON.stringify(file)}\n`);

const multi = file.stations.filter((s) => s.members.length > 1);
const bays = multi.reduce((acc, s) => acc + s.members.length, 0);
console.log(
  `${stops.length} stop records → ${file.stations.length} stations ` +
    `(${multi.length} multi-bay stations covering ${bays} records)`,
);

if (process.argv.includes("--report")) {
  for (const s of multi.sort((a, b) => b.members.length - a.members.length)) {
    console.log(`\n${s.name}  [${s.members.length} bays, spread ${s.spreadM}m]`);
    for (const m of s.members) console.log(`   ${m}`);
  }
}
