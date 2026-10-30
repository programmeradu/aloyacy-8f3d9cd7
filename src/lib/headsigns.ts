export * from "@aloya/core/headsigns";
import { getHeadsignSync as rawHeadsignSync } from "@aloya/core/headsigns";
import { STOPS } from "@/lib/gtfs";
import { repairHeadsign } from "@/lib/place-names";

// The feed cuts headsigns at 17 characters ("University of Cyp"); every screen
// reads the repaired, full name through this wrapper.
let names: string[] | null = null;
const repaired = new Map<string, string>();

export function getHeadsignSync(tripId: string, routeId?: string): string | null {
  const h = rawHeadsignSync(tripId, routeId);
  if (!h) return h;
  let out = repaired.get(h);
  if (out == null) {
    names ??= Array.from(new Set(STOPS.map((s) => s.name)));
    out = repairHeadsign(h, names);
    repaired.set(h, out);
  }
  return out;
}
