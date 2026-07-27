// Missed-bus rescue — re-plan from the rider's current trip endpoints and
// seed a fresh ActiveTrip so `/trip/[id]` can take over. Kept out of the HUD
// component so the card stays presentational.

import { fetchPlan } from "./plan";
import { setActiveTrip, type ActiveTrip } from "./trip-store";
import { itineraryToJourneyOption } from "./itineraryToTrip";

export type RescueResult =
  | { ok: true; tripId: string }
  | { ok: false; error: string };

export async function replanRescue(trip: ActiveTrip): Promise<RescueResult> {
  try {
    const { itineraries } = await fetchPlan({ from: trip.from, to: trip.to });
    if (!itineraries || itineraries.length === 0) {
      return { ok: false, error: "No later options right now. Try again in a minute." };
    }
    const next = itineraries[0];
    const option = itineraryToJourneyOption(next);
    if (!option) {
      return { ok: false, error: "That route has no bus leg to track. Try planning again." };
    }
    const multiLeg = next.legs.filter((l) => l.kind === "ride").length > 1;
    setActiveTrip({
      startedAt: Date.now(),
      from: trip.from,
      to: trip.to,
      live: { startedAt: Date.now() },
      option,
      itinerary: multiLeg ? next : undefined,
      legState: multiLeg
        ? { currentLegIndex: 0, perLeg: { 0: { enteredAt: Date.now() } } }
        : undefined,
    });
    return { ok: true, tripId: option.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't refresh right now.",
    };
  }
}
