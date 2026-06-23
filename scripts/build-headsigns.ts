import fs from "node:fs";
import path from "node:path";

const tripsRaw = JSON.parse(fs.readFileSync("public/data/schedule/trips.json", "utf-8")) as Record<
  string,
  { routeId: string; direction: 0 | 1; headsign: string; feedId: number }
>;
const routesRaw = JSON.parse(fs.readFileSync("public/data/schedule/routes.json", "utf-8")) as Record<
  string,
  { short: string; feedId: number }
>;

// Group by un-namespaced routeId+tripId — that's how the realtime feed reports
// them. We strip the "<feedId>:" prefix that the ingest script adds.
type Bundle = { trips: Record<string, number>; headsigns: string[] };
const out: Record<string, Bundle> = {};

for (const [nsTripId, t] of Object.entries(tripsRaw)) {
  const tripId = nsTripId.includes(":") ? nsTripId.split(":").slice(1).join(":") : nsTripId;
  const routeId = t.routeId.includes(":") ? t.routeId.split(":").slice(1).join(":") : t.routeId;
  const head = (t.headsign || "").trim();
  if (!head) continue;
  const b = (out[routeId] ??= { trips: {}, headsigns: [] });
  let idx = b.headsigns.indexOf(head);
  if (idx < 0) { idx = b.headsigns.length; b.headsigns.push(head); }
  b.trips[tripId] = idx;
}

fs.writeFileSync("public/gtfs-headsigns.json", JSON.stringify(out));
const size = fs.statSync("public/gtfs-headsigns.json").size;
console.log(`wrote public/gtfs-headsigns.json — ${(size/1024).toFixed(0)} KB, ${Object.keys(out).length} routes`);
