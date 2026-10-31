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

import { loadScheduleForDate, todayLocalDate, serviceDateToUnix } from "./schedule-loader.server";
import { cyParts } from "@aloya/core/cy-time";

/** Cyprus-local YYYYMMDD for a given unix second timestamp. */
export function localDateForUnix(unix: number): string {
  const p = cyParts(unix * 1000);
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}
void todayLocalDate;
import { planRaptor, type RaptorDiagnostics } from "./raptor.server";
import { rebaseToLeave } from "./raptor-plan";
import { fetchRealtime } from "./gtfs-rt.server";
import { refineAllItineraries } from "./walk-refine.server";
import type { Itinerary } from "./itinerary-types";
import { createLogger } from "@/lib/logger";

const log = createLogger("scheduled");

export type ScheduledDiagnostics = RaptorDiagnostics & {
  liveArrivalCount: number;
  legsOverlaid: number;
  loadMs: number;
  raptorMs: number;
  overlayMs: number;
  walkRefineMs: number;
  walkLegsVerified: number;
  itinerariesDroppedAfterRefine: number;
  /** Set when the 4h "leave now" window was empty and we widened to 24h. */
  widenedHorizon?: boolean;
  /** Set when nothing ran again today and results come from the next service day. */
  rolledToNextDay?: boolean;
  /** The service date the returned itineraries actually belong to. */
  serviceDate?: string;
};

export class NoScheduleAvailableError extends Error {
  constructor(public date: string) {
    super(`No timetable shard for ${date}`);
  }
}

import type { AccessibilityPrefs } from "@aloya/core/raptor-core";

export async function planMultiLegScheduled(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
  opts?: { departureUnix?: number; date?: string; explicitTime?: boolean; accessibilityPrefs?: AccessibilityPrefs },
): Promise<{ itineraries: Itinerary[]; diagnostics: ScheduledDiagnostics }> {
  const departureUnix = opts?.departureUnix ?? Math.floor(Date.now() / 1000);
  // Derive service date from the departure time (Cyprus local), so "tomorrow 7am"
  // loads tomorrow's shard, not today's.
  const date = opts?.date ?? localDateForUnix(departureUnix);

  const tLoad0 = Date.now();
  async function loadOrThrow(d: string) {
    try {
      return await loadScheduleForDate(d);
    } catch (err) {
      const msg = (err as Error).message || "";
      // Loader reports "→ 404" when the shard isn't published yet.
      if (/404/.test(msg)) throw new NoScheduleAvailableError(d);
      throw err;
    }
  }
  let schedule = await loadOrThrow(date);
  const loadMs = Date.now() - tLoad0;

  const tRap0 = Date.now();
  let searchDate = date;
  let searchDepartureUnix = departureUnix;
  let rolledToNextDay = false;
  let widenedHorizon = false;

  let { itineraries, diagnostics } = await planRaptor(
    schedule,
    from,
    to,
    departureUnix,
    opts?.explicitTime 
      ? { searchHorizonSec: 24 * 3600, maxJourneySec: 30 * 3600, accessibilityPrefs: opts?.accessibilityPrefs } 
      : { accessibilityPrefs: opts?.accessibilityPrefs },
  );

  // "Leave now" defaults to a 4h horizon so the common case stays fast. When
  // that finds nothing — overnight, Sundays, holidays, or a sparse intercity
  // corridor — escalate rather than telling the rider there is no route:
  //   1. same service day, full 24h horizon
  //   2. the next service day, from the start of its service window
  // Riders get "first bus at 05:40" instead of a dead end.
  if (!opts?.explicitTime && itineraries.length === 0) {
    widenedHorizon = true;
    const wide = await planRaptor(schedule, from, to, departureUnix, {
      searchHorizonSec: 24 * 3600,
      maxJourneySec: 30 * 3600,
      accessibilityPrefs: opts?.accessibilityPrefs,
    });
    itineraries = wide.itineraries;
    diagnostics = wide.diagnostics;

    if (itineraries.length === 0) {
      // Roll to the next service day. Search from that day's midnight so the
      // very first departure is reachable; the journey cap is widened to
      // cover the overnight wait.
      const nextDate = localDateForUnix(departureUnix + 24 * 3600);
      try {
        const nextSchedule = await loadOrThrow(nextDate);
        const nextStart = serviceDateToUnix(nextDate, 0);
        const rolled = await planRaptor(nextSchedule, from, to, nextStart, {
          searchHorizonSec: 24 * 3600,
          maxJourneySec: 30 * 3600,
          accessibilityPrefs: opts?.accessibilityPrefs,
        });
        if (rolled.itineraries.length > 0) {
          itineraries = rolled.itineraries;
          diagnostics = rolled.diagnostics;
          schedule = nextSchedule;
          searchDate = nextDate;
          searchDepartureUnix = nextStart;
          rolledToNextDay = true;
        }
      } catch (err) {
        // No shard for tomorrow yet — keep the empty same-day result.
        log.warn("next-day rollover skipped", { reason: (err as Error).message });
      }
    }
  }
  void schedule;
  void searchDepartureUnix;
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
    const stripNs = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);
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
    log.warn("realtime overlay failed", { reason: (err as Error).message });
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
  // Re-base on the moment the rider sets off only after the walks are
  // verified: refinement checks each walk against the search departure, and a
  // departure already pulled up to "first boarding minus the estimated walk"
  // left no slack, so every option was dropped as a missed bus.
  const refinedItineraries = (await refineAllItineraries(itineraries)).map(rebaseToLeave);
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
      widenedHorizon,
      rolledToNextDay,
      serviceDate: searchDate,
    },
  };
}
