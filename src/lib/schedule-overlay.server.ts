// Live overlay for timetable itineraries the browser planned (see
// schedule-client.ts). Cheap on the Worker: one lookup per ride leg against
// the realtime snapshot the live planner has already fetched and cached.

import { fetchRealtime } from "./gtfs-rt.server";
import type { Itinerary } from "./itinerary-types";

const MAX_CLIENT_ITINERARIES = 40;

/** Keep only well-formed itineraries; the payload comes from the browser. */
export function sanitizeClientItineraries(input: unknown): Itinerary[] {
  if (!Array.isArray(input)) return [];
  const out: Itinerary[] = [];
  for (const raw of input.slice(0, MAX_CLIENT_ITINERARIES)) {
    const it = raw as Partial<Itinerary> | null;
    if (!it || typeof it !== "object") continue;
    if (!Array.isArray(it.legs) || it.legs.length === 0 || it.legs.length > 16) continue;
    if (!Number.isFinite(it.departureUnix) || !Number.isFinite(it.arrivalUnix)) continue;
    if (!Number.isFinite(it.totalDurationSec)) continue;
    if (!it.legs.every((l) => l && typeof l === "object" && typeof (l as { kind?: unknown }).kind === "string"))
      continue;
    out.push(it as Itinerary);
  }
  return out;
}

export async function overlayLiveOnScheduled(
  itineraries: Itinerary[],
): Promise<{ liveArrivalCount: number; legsOverlaid: number }> {
  let liveArrivalCount = 0;
  let legsOverlaid = 0;
  try {
    const rt = await fetchRealtime();
    liveArrivalCount = rt.arrivals.length;
    const stripNs = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);
    const byKey = new Map<string, { arrivalUnix: number; delaySec: number }>();
    for (const a of rt.arrivals) {
      byKey.set(`${a.tripId}|${a.stopId}`, { arrivalUnix: a.arrivalUnix, delaySec: a.delaySec });
    }
    for (const it of itineraries) {
      let anyLive = false;
      for (const leg of it.legs) {
        if (leg.kind !== "ride") continue;
        const rawTrip = stripNs(String(leg.tripId ?? ""));
        const board = byKey.get(`${rawTrip}|${stripNs(String(leg.board?.stopId ?? ""))}`);
        const alight = byKey.get(`${rawTrip}|${stripNs(String(leg.alight?.stopId ?? ""))}`);
        if (board) {
          leg.board.departureUnix = board.arrivalUnix;
          leg.delaySec = board.delaySec;
          leg.live = true;
          anyLive = true;
          legsOverlaid++;
        }
        if (alight) {
          leg.alight.arrivalUnix = alight.arrivalUnix;
          leg.live = true;
          if (!board) {
            anyLive = true;
            legsOverlaid++;
          }
        }
      }
      if (anyLive) it.source = "mixed";
    }
  } catch {
    // The overlay is optional; timetable times stand on their own.
  }
  return { liveArrivalCount, legsOverlaid };
}
