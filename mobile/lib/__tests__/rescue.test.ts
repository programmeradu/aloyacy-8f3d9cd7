import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetStorage } from "../../test/stubs/async-storage";

// `fetchPlan` is the network boundary; everything else in the rescue path is
// real shipped code (itinerary shaping, active-trip seeding).
const fetchPlan = vi.fn();
vi.mock("../plan", () => ({ fetchPlan: (...args: unknown[]) => fetchPlan(...args) }));

import { replanRescue } from "../rescue";
import { getActiveTrip, type ActiveTrip } from "../trip-store";

const NOW = () => Math.floor(Date.now() / 1000);

const from = { lat: 35.17, lng: 33.36, label: "Solomou Square" };
const to = { lat: 34.68, lng: 33.04, label: "Limassol Old Port" };

const rideLeg = (over: Record<string, unknown> = {}) => ({
  kind: "ride" as const,
  routeId: "r30",
  routeShort: "30",
  headsign: "Limassol",
  tripId: "t1",
  board: { stopId: "s1", name: "Solomou", lat: 35.17, lng: 33.36, departureUnix: NOW() + 300 },
  alight: { stopId: "s2", name: "Old Port", lat: 34.68, lng: 33.04, arrivalUnix: NOW() + 3600 },
  ...over,
});

const walkLeg = () => ({
  kind: "walk" as const,
  durationSec: 240,
  distanceMeters: 300,
  to: { name: "Solomou", lat: 35.17, lng: 33.36 },
});

const itinerary = (legs: unknown[]) => ({
  departureUnix: NOW() + 120,
  arrivalUnix: NOW() + 3700,
  durationSec: 3580,
  transfers: Math.max(0, legs.filter((l) => (l as { kind: string }).kind === "ride").length - 1),
  legs,
});

const trip: ActiveTrip = {
  startedAt: Date.now(),
  from,
  to,
  live: { startedAt: Date.now() },
  option: null as never,
} as ActiveTrip;

beforeEach(() => {
  fetchPlan.mockReset();
  __resetStorage();
});

describe("replanRescue", () => {
  it("seeds a fresh active trip from the first itinerary", async () => {
    fetchPlan.mockResolvedValue({ itineraries: [itinerary([walkLeg(), rideLeg()])] });

    const result = await replanRescue(trip);

    expect(fetchPlan).toHaveBeenCalledWith({ from, to });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seeded = getActiveTrip();
    expect(seeded?.option.id).toBe(result.tripId);
    expect(seeded?.from.label).toBe("Solomou Square");
    expect(seeded?.to.label).toBe("Limassol Old Port");
    // A single-ride itinerary needs no multi-leg bookkeeping.
    expect(seeded?.itinerary).toBeUndefined();
    expect(seeded?.legState).toBeUndefined();
  });

  it("keeps the full itinerary and leg state when the plan has a transfer", async () => {
    fetchPlan.mockResolvedValue({
      itineraries: [
        itinerary([
          rideLeg(),
          walkLeg(),
          rideLeg({ routeId: "r41", routeShort: "41", tripId: "t2" }),
        ]),
      ],
    });

    const result = await replanRescue(trip);
    expect(result.ok).toBe(true);
    const seeded = getActiveTrip();
    expect(seeded?.itinerary?.legs).toHaveLength(3);
    expect(seeded?.legState?.currentLegIndex).toBe(0);
    expect(seeded?.legState?.perLeg[0]?.enteredAt).toBeTypeOf("number");
  });

  it("explains an empty result in plain language instead of throwing", async () => {
    fetchPlan.mockResolvedValue({ itineraries: [] });
    await expect(replanRescue(trip)).resolves.toEqual({
      ok: false,
      error: "No later options right now. Try again in a minute.",
    });
  });

  it("handles a planner response with no itineraries field", async () => {
    fetchPlan.mockResolvedValue({});
    const result = await replanRescue(trip);
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects a walk-only itinerary that has nothing to track", async () => {
    fetchPlan.mockResolvedValue({ itineraries: [itinerary([walkLeg()])] });
    await expect(replanRescue(trip)).resolves.toEqual({
      ok: false,
      error: "That route has no bus leg to track. Try planning again.",
    });
  });

  it("surfaces the planner's error message when the request fails", async () => {
    fetchPlan.mockRejectedValue(new Error("Planner unreachable"));
    await expect(replanRescue(trip)).resolves.toEqual({
      ok: false,
      error: "Planner unreachable",
    });
  });

  it("falls back to friendly copy for non-Error rejections", async () => {
    fetchPlan.mockRejectedValue("boom");
    await expect(replanRescue(trip)).resolves.toEqual({
      ok: false,
      error: "Couldn't refresh right now.",
    });
  });
});
