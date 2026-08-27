import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { RideLeg } from "./itinerary-types";
import { planRaptor } from "./raptor.server";
import type { LoadedSchedule } from "./schedule-loader.server";
import { serviceDateToUnix } from "./schedule-loader.server";

function readJson<T>(repoRoot: string, rel: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8")) as T;
}

describe("planRaptor", () => {
  // Loading the full bundled GTFS day and running RAPTOR over it takes well
  // past vitest's 5s default on a cold cache, and the by-date folders roll
  // forward, so pick the earliest date still shipped rather than pinning one.
  it("keeps the direct 19 from Solomos to Komninou ahead of feeder changes", { timeout: 60_000 }, async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const dates = readJson<string[] | { dates?: string[] }>(
      repoRoot,
      "public/data/schedule/by-date/index.json",
    );
    const available = (Array.isArray(dates) ? dates : (dates.dates ?? [])).slice().sort();
    const date = available[0] ?? "20260826";
    const schedule: LoadedSchedule = {
      date,
      stops: readJson(repoRoot, "public/data/schedule/stops.json"),
      routes: readJson(repoRoot, "public/data/schedule/routes.json"),
      trips: readJson(repoRoot, "public/data/schedule/trips.json"),
      stopTrips: readJson(repoRoot, `public/data/schedule/by-date/${date}/stop-trips.json`),
      stopTimes: readJson(repoRoot, `public/data/schedule/by-date/${date}/stop-times.json`),
    };

    const result = await planRaptor(
      schedule,
      { lat: 35.1706703539398, lng: 33.3589423385517, label: "Solomos Square" },
      { lat: 35.1540856, lng: 33.3416806, label: "Isaakiou Komninou" },
      serviceDateToUnix(date, 14 * 3600 + 38 * 60),
      { searchHorizonSec: 24 * 3600, maxJourneySec: 30 * 3600 },
    );

    const direct19 = result.itineraries.find((it) => {
      const rides = it.legs.filter((leg): leg is RideLeg => leg.kind === "ride");
      return it.transfers === 0 && rides.length === 1 && rides[0].routeShort === "19";
    });
    expect(direct19).toBeDefined();
    expect(result.itineraries[0].transfers).toBe(0);
  });
});