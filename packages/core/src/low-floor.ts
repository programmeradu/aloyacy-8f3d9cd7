// D1 lowFloor filter. A rider who asked for step-free should not be
// sent to a stop we know has a kerb. Unknown stays on the list.
// Not a 60 s nudge — that stays in accessibility-weights for ranking.

import type { Itinerary } from "./itinerary-types";

export function wheelchairBlocksLowFloor(value: string | null | undefined): boolean {
  return value === "no";
}

export function collectItineraryStopIds(itineraries: Itinerary[]): string[] {
  const ids = new Set<string>();
  for (const it of itineraries) {
    for (const leg of it.legs) {
      if (leg.kind === "ride") {
        if (leg.board.stopId) ids.add(leg.board.stopId);
        if (leg.alight.stopId) ids.add(leg.alight.stopId);
      } else if (leg.kind === "wait") {
        if (leg.stopId) ids.add(leg.stopId);
      } else {
        if (leg.from.stopId) ids.add(leg.from.stopId);
        if (leg.to.stopId) ids.add(leg.to.stopId);
      }
    }
  }
  return [...ids];
}

export function itineraryHasKnownKerb(
  it: Itinerary,
  accessByStop: Record<string, string>,
): boolean {
  for (const leg of it.legs) {
    if (leg.kind === "ride") {
      if (wheelchairBlocksLowFloor(accessByStop[leg.board.stopId])) return true;
      if (wheelchairBlocksLowFloor(accessByStop[leg.alight.stopId])) return true;
    } else if (leg.kind === "wait") {
      if (wheelchairBlocksLowFloor(accessByStop[leg.stopId])) return true;
    } else {
      if (wheelchairBlocksLowFloor(accessByStop[leg.from.stopId ?? ""])) return true;
      if (wheelchairBlocksLowFloor(accessByStop[leg.to.stopId ?? ""])) return true;
    }
  }
  return false;
}

/** Drop itineraries that use a stop we know is not step-free. */
export function filterLowFloorItineraries(
  itineraries: Itinerary[],
  accessByStop: Record<string, string>,
): Itinerary[] {
  if (itineraries.length === 0) return itineraries;
  return itineraries.filter((it) => !itineraryHasKnownKerb(it, accessByStop));
}
