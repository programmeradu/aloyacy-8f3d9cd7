import type { Itinerary } from "@/lib/itinerary-types";
import { splitItineraries } from "@/lib/plan-bridge";

export type ResultSort = "rec" | "fast" | "direct";

/**
 * Recommended: direct trips first, then any trips that need a transfer
 * (planner order within each). Fastest: earliest arrival. Direct: fewest
 * changes, then earliest arrival. The first card is the highlighted one.
 */
export function sortItineraries(results: Itinerary[], sort: ResultSort = "rec"): Itinerary[] {
  if (sort === "fast") return [...results].sort((a, b) => a.arrivalUnix - b.arrivalUnix);
  if (sort === "direct")
    return [...results].sort((a, b) => a.transfers - b.transfers || a.arrivalUnix - b.arrivalUnix);
  const { direct, transfers } = splitItineraries(results);
  return [...direct, ...transfers];
}
