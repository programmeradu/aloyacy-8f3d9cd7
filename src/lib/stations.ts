// Station layer for the planner.
//
// The Cyprus GTFS feeds describe a place like Solomos Square as five separate
// stop records, split across two operators and spread over about a hundred
// metres. A rider standing there sees one bus station. When the planner treats
// those records as five unrelated points it can talk itself into boarding one
// route at bay A and changing onto another at bay B — a "transfer" the rider
// could have skipped by walking thirty metres before getting on at all.
//
// `scripts/build-stations.ts` clusters the records offline into
// `src/data/stations.json`; this module loads that file and answers the two
// questions the search actually asks.

import stationData from "@/data/stations.json";
import type { Station } from "@aloya/core/stations";

type StationFile = { generatedFrom: number; stations: Station[] };

const data = stationData as StationFile;

const stationById = new Map<string, Station>();
const stationIdByStopKey = new Map<string, string>();

for (const station of data.stations) {
  stationById.set(station.id, station);
  for (const member of station.members) {
    stationIdByStopKey.set(member, station.id);
    // Feeds refer to the same physical bay by bare id as well as `agency:id`.
    const colon = member.indexOf(":");
    if (colon !== -1) {
      const bare = member.slice(colon + 1);
      if (!stationIdByStopKey.has(bare)) stationIdByStopKey.set(bare, station.id);
    }
  }
}

/** Station id for a stop record, or undefined when the stop is unknown. */
export function stationIdOf(stopId: string): string | undefined {
  return stationIdByStopKey.get(stopId);
}

/** True when two stop records are bays of one physical station. */
export function sameStation(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = stationIdByStopKey.get(a);
  return sa !== undefined && sa === stationIdByStopKey.get(b);
}

export function getStation(stationId: string): Station | undefined {
  return stationById.get(stationId);
}

/** Every bay of the station a stop belongs to, including the stop itself. */
export function bayIdsFor(stopId: string): string[] {
  const id = stationIdByStopKey.get(stopId);
  const station = id ? stationById.get(id) : undefined;
  if (!station) return [stopId];
  return station.members.map((m) => {
    const colon = m.indexOf(":");
    return colon === -1 ? m : m.slice(colon + 1);
  });
}

export const stationCount = data.stations.length;
