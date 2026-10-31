import type { Itinerary } from "@/lib/itinerary-types";
import { splitItineraries } from "@/lib/plan-bridge";

export type ResultSort = "rec" | "fast" | "direct";

/**
 * Recommended: the planner's order (it already prices every change, walk and
 * minute). A direct trip is lifted to the top only when it arrives within
 * DIRECT_LIFT_SEC of the planner's pick, so a one-seat ride three hours later
 * never outranks the trip that gets you there. Fastest: earliest arrival.
 * Direct: fewest changes, then earliest arrival. The first card is the
 * highlighted one.
 */
const DIRECT_LIFT_SEC = 15 * 60;

export function sortItineraries(results: Itinerary[], sort: ResultSort = "rec"): Itinerary[] {
  if (sort === "fast") return [...results].sort((a, b) => a.arrivalUnix - b.arrivalUnix);
  if (sort === "direct")
    return [...results].sort((a, b) => a.transfers - b.transfers || a.arrivalUnix - b.arrivalUnix);
  const top = results[0];
  if (!top) return [];
  const direct = splitItineraries(results).direct[0];
  if (direct && direct !== top && direct.arrivalUnix - top.arrivalUnix <= DIRECT_LIFT_SEC) {
    return [direct, ...results.filter((it) => it !== direct)];
  }
  return [...results];
}
