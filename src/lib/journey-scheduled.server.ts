// Scheduled multi-leg planner — Phase 2c entry point.
//
// Loads the per-date schedule shard, runs bounded RAPTOR, then overlays the
// live GTFS-RT feed for any ride leg whose tripId matches a live arrival.
// Tags each ride leg's source:
//   - "live"      → tripId found in realtime, times replaced
//   - "predicted" → tripId not in realtime, learned mean delay applied (future)
//   - "scheduled" → no live data, raw timetable
//
// Returns the same Itinerary shape as the realtime planner so the UI is
// indifferent to which planner produced a given result.

import { loadScheduleForDate, todayLocalDate } from "./schedule-loader.server";
import { planRaptor, type RaptorDiagnostics } from "./raptor.server";
import { fetchRealtime } from "./gtfs-rt.server";
import { refineAllItineraries } from "./walk-refine.server";
import type { Itinerary, RideLeg } from "./itinerary-types";

export type ScheduledDiagnostics = RaptorDiagnostics & {
  liveArrivalCount: number;
  legsOverlaid: number;
  loadMs: number;
  raptorMs: number;
  overlayMs: number;
  walkRefineMs: number;
  walkLegsVerified: number;
  itinerariesDroppedAfterRefine: number;
};

export async function planMultiLegScheduled(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  opts?: { departureUnix?: number },
): Promise<{ itineraries: Itinerary[]; diagnostics: ScheduledDiagnostics }> {
  const departureUnix = opts?.departureUnix ?? Math.floor(Date.now() / 1000);
  const date = todayLocalDate();

  const tLoad0 = Date.now();
  const schedule = await loadScheduleForDate(date);
  const loadMs = Date.now() - tLoad0;

  const tRap0 = Date.now();
  const { itineraries, diagnostics } = await planRaptor(schedule, from, to, departureUnix);
  const raptorMs = Date.now() - tRap0;

  // ---- Realtime overlay --------------------------------------------------
  const tOv0 = Date.now();
  let liveArrivalCount = 0;
  let legsOverlaid = 0;
  try {
    const rt = await fetchRealtime();
    liveArrivalCount = rt.arrivals.length;
    // Index live arrivals by (tripId, stopId) for O(1) lookup.
    // RT feed uses raw GTFS IDs; our scheduled legs have feed-namespaced IDs
    // ("10:6117"). Strip the namespace before matching.
    const stripNs = (id: string) => id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
    const byKey = new Map<string, { arrivalUnix: number; delaySec: number }>();
    for (const a of rt.arrivals) {
      byKey.set(`${a.tripId}|${a.stopId}`, { arrivalUnix: a.arrivalUnix, delaySec: a.delaySec });
    }
    for (const it of itineraries) {
      let anyLive = false;
      for (const leg of it.legs) {
        if (leg.kind !== "ride") continue;
        const rawTrip = stripNs(leg.tripId);
        const board = byKey.get(`${rawTrip}|${stripNs(leg.board.stopId)}`);
        const alight = byKey.get(`${rawTrip}|${stripNs(leg.alight.stopId)}`);
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
  } catch (err) {
    // Realtime overlay is optional — never let it sink the planner.
    console.warn("[scheduled] realtime overlay failed:", (err as Error).message);
  }
  const overlayMs = Date.now() - tOv0;

  // ---- Walk refinement (Google Routes) ----------------------------------
  // Replace RAPTOR's haversine × 1.35 walk estimates with real walking
  // durations. Stop-pair walks hit the cached `walk_links` table; access
  // and egress walks call Google Routes directly. Itineraries that become
  // physically infeasible (verified access walk overruns board time) are
  // dropped here, not surfaced to the rider.
  const tRef0 = Date.now();
  const beforeCount = itineraries.length;
  const refinedItineraries = await refineAllItineraries(itineraries);
  const walkRefineMs = Date.now() - tRef0;
  const walkLegsVerified = refinedItineraries.reduce(
    (acc, it) => acc + it.legs.filter((l) => l.kind === "walk" && l.verified).length,
    0,
  );
  const itinerariesDroppedAfterRefine = beforeCount - refinedItineraries.length;

  return {
    itineraries: refinedItineraries,
    diagnostics: {
      ...diagnostics,
      liveArrivalCount,
      legsOverlaid,
      loadMs,
      raptorMs,
      overlayMs,
      walkRefineMs,
      walkLegsVerified,
      itinerariesDroppedAfterRefine,
    },
  };
}
