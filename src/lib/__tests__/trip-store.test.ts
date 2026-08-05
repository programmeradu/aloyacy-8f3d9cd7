// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActiveTrip, SavedPlace } from "../trip-store";
import type { Itinerary, RideLeg, WalkLeg } from "../itinerary-types";
import type { JourneyOption } from "../journey.server";

vi.mock("../trip-sync.functions", () => ({
  upsertActiveTrip: vi.fn().mockResolvedValue({ ok: true }),
  removeActiveTrip: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("../pwa", () => ({
  getDeviceId: vi.fn().mockReturnValue("device-1234567890"),
}));

import { upsertActiveTrip, removeActiveTrip } from "../trip-sync.functions";
import * as tripStore from "../trip-store";

function makeOption(overrides: Partial<JourneyOption> = {}): JourneyOption {
  return {
    id: "opt1",
    totalDurationSec: 1200,
    departureUnix: 1000,
    arrivalUnix: 2200,
    transfers: 0,
    scheduled: true,
    legs: [
      { kind: "walk", from: { lat: 1, lng: 1, label: "A" }, to: { lat: 2, lng: 2, label: "B" }, durationSec: 300, distanceMeters: 400 },
      {
        kind: "bus",
        routeId: "r1",
        routeShort: "1",
        routeLong: "Route 1",
        tripId: "t1",
        board: { stopId: "s1", name: "Board", departureUnix: 1000 },
        alight: { stopId: "s2", name: "Alight", arrivalUnix: 1800 },
        delaySec: 0,
        scheduled: true,
      },
      { kind: "walk", from: { lat: 3, lng: 3, label: "C" }, to: { lat: 4, lng: 4, label: "D" }, durationSec: 300, distanceMeters: 400 },
    ],
    ...overrides,
  } as JourneyOption;
}

function makeTrip(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
  return {
    startedAt: Date.now(),
    option: makeOption(),
    from: { lat: 1, lng: 1, label: "A" },
    to: { lat: 4, lng: 4, label: "D" },
    ...overrides,
  };
}

function rideLeg(overrides: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "r1",
    routeShort: "1",
    routeLong: "Route 1",
    tripId: "t1",
    live: true,
    board: { stopId: "s1", name: "Board", lat: 1, lng: 1, departureUnix: 1000 },
    alight: { stopId: "s2", name: "Alight", lat: 2, lng: 2, arrivalUnix: 1800 },
    stopCount: 3,
    delaySec: 0,
    ...overrides,
  };
}
function walkLeg(overrides: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: { name: "A", lat: 1, lng: 1 },
    to: { name: "B", lat: 2, lng: 2 },
    durationSec: 300,
    distanceMeters: 400,
    verified: true,
    ...overrides,
  };
}
function makeItinerary(legs: Itinerary["legs"], overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: "it1",
    legs,
    totalDurationSec: 1000,
    departureUnix: 900,
    arrivalUnix: 2300,
    transfers: legs.filter((l) => l.kind === "ride").length - 1,
    totalWalkMeters: 800,
    score: 1,
    source: "live",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("active trip persistence", () => {
  it("returns null when nothing stored", () => {
    expect(tripStore.getActiveTrip()).toBeNull();
  });
  it("round-trips a trip through set/get", async () => {
    const trip = makeTrip();
    tripStore.setActiveTrip(trip);
    // flush the fire-and-forget server sync microtask
    await Promise.resolve();
    await Promise.resolve();
    const got = tripStore.getActiveTrip();
    expect(got).not.toBeNull();
    expect(got!.option.id).toBe("opt1");
    expect(upsertActiveTrip).toHaveBeenCalledTimes(1);
    const call = (upsertActiveTrip as any).mock.calls[0][0];
    expect(call.data.deviceId).toBe("device-1234567890");
    expect(call.data.routeShort).toBe("1");
  });
  it("skips server sync when there is no bus leg", async () => {
    const trip = makeTrip({ option: makeOption({ legs: [] }) });
    tripStore.setActiveTrip(trip);
    await Promise.resolve();
    expect(upsertActiveTrip).not.toHaveBeenCalled();
  });
  it("clears the active trip", async () => {
    tripStore.setActiveTrip(makeTrip());
    await Promise.resolve();
    tripStore.clearActiveTrip();
    await Promise.resolve();
    expect(tripStore.getActiveTrip()).toBeNull();
    expect(removeActiveTrip).toHaveBeenCalled();
  });
  it("logs a warning if server sync rejects, without throwing", async () => {
    (upsertActiveTrip as any).mockRejectedValueOnce(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => tripStore.setActiveTrip(makeTrip())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
  it("expires a trip past the hard age cap", () => {
    const trip = makeTrip({ startedAt: Date.now() - 7 * 60 * 60 * 1000 });
    tripStore.setActiveTrip(trip);
    expect(tripStore.getActiveTrip()).toBeNull();
  });
  it("expires a trip past the arrival grace window (legacy option arrivalUnix)", () => {
    const pastArrival = Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000);
    const trip = makeTrip({
      startedAt: Date.now() - 60_000,
      option: makeOption({
        legs: [
          {
            kind: "bus",
            routeId: "r1",
            routeShort: "1",
            routeLong: "Route 1",
            tripId: "t1",
            board: { stopId: "s1", name: "Board", departureUnix: 1000 },
            alight: { stopId: "s2", name: "Alight", arrivalUnix: pastArrival },
            delaySec: 0,
            scheduled: true,
          },
        ],
      }),
    });
    tripStore.setActiveTrip(trip);
    expect(tripStore.getActiveTrip()).toBeNull();
  });
  it("expires using itinerary.arrivalUnix when present", () => {
    const pastArrival = Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000);
    const trip = makeTrip({
      startedAt: Date.now() - 60_000,
      itinerary: makeItinerary([rideLeg()], { arrivalUnix: pastArrival }),
    });
    tripStore.setActiveTrip(trip);
    expect(tripStore.getActiveTrip()).toBeNull();
  });
  it("keeps a fresh trip with a future arrival", () => {
    const trip = makeTrip({
      startedAt: Date.now() - 60_000,
      itinerary: makeItinerary([rideLeg()], { arrivalUnix: Math.floor(Date.now() / 1000) + 3600 }),
    });
    tripStore.setActiveTrip(trip);
    expect(tripStore.getActiveTrip()).not.toBeNull();
  });
  it("returns null gracefully on malformed JSON in storage", () => {
    localStorage.setItem("aloya:active-trip", "{not json");
    expect(tripStore.getActiveTrip()).toBeNull();
  });
});

describe("patchActiveTripLive", () => {
  it("is a no-op when there is no active trip", () => {
    tripStore.patchActiveTripLive({ missedAt: 1 });
    expect(tripStore.getActiveTrip()).toBeNull();
  });
  it("merges live state onto the current trip", async () => {
    tripStore.setActiveTrip(makeTrip());
    await Promise.resolve();
    tripStore.patchActiveTripLive({ onBoardConfirmedAt: 555 });
    const got = tripStore.getActiveTrip();
    expect(got!.live!.onBoardConfirmedAt).toBe(555);
    expect(got!.live!.startedAt).toBeTypeOf("number");
  });
});

describe("multi-leg helpers", () => {
  it("rideLegsOf filters to ride legs only", () => {
    const it = makeItinerary([walkLeg(), rideLeg(), walkLeg()]);
    expect(tripStore.rideLegsOf(it)).toHaveLength(1);
  });
  it("isMultiLeg is false for undefined, single ride, true for 2+", () => {
    expect(tripStore.isMultiLeg(undefined)).toBe(false);
    expect(tripStore.isMultiLeg(makeItinerary([rideLeg()]))).toBe(false);
    expect(tripStore.isMultiLeg(makeItinerary([rideLeg(), rideLeg()]))).toBe(true);
  });
  it("initialLegState starts at leg 0 with enteredAt stamp", () => {
    const s = tripStore.initialLegState();
    expect(s.currentLegIndex).toBe(0);
    expect(s.perLeg[0].enteredAt).toBeTypeOf("number");
  });
  it("patchCurrentLeg is a no-op with no active trip or no legState", async () => {
    tripStore.patchCurrentLeg({ missedAt: 1 });
    expect(tripStore.getActiveTrip()).toBeNull();
    tripStore.setActiveTrip(makeTrip());
    await Promise.resolve();
    tripStore.patchCurrentLeg({ missedAt: 1 }); // trip has no legState
    expect(tripStore.getActiveTrip()!.legState).toBeUndefined();
  });
  it("patchCurrentLeg patches the current leg's state", async () => {
    tripStore.setActiveTrip(makeTrip({ legState: tripStore.initialLegState() }));
    await Promise.resolve();
    tripStore.patchCurrentLeg({ arrivedAt: 42 });
    const got = tripStore.getActiveTrip();
    expect(got!.legState!.perLeg[0].arrivedAt).toBe(42);
  });
  it("advanceToNextLeg is a no-op without legState/itinerary or at the last leg", async () => {
    tripStore.setActiveTrip(makeTrip());
    await Promise.resolve();
    tripStore.advanceToNextLeg();
    expect(tripStore.getActiveTrip()!.legState).toBeUndefined();

    const itinerary = makeItinerary([rideLeg()]);
    tripStore.setActiveTrip(
      makeTrip({ itinerary, legState: { currentLegIndex: 0, perLeg: {} } }),
    );
    await Promise.resolve();
    tripStore.advanceToNextLeg(); // idx 0 is last (total legs = 1)
    expect(tripStore.getActiveTrip()!.legState!.currentLegIndex).toBe(0);
  });
  it("advanceToNextLeg completes the current leg and enters the next", async () => {
    const itinerary = makeItinerary([walkLeg(), rideLeg(), walkLeg()]);
    tripStore.setActiveTrip(
      makeTrip({ itinerary, legState: { currentLegIndex: 0, perLeg: { 0: { enteredAt: 1 } } } }),
    );
    await Promise.resolve();
    tripStore.advanceToNextLeg();
    const got = tripStore.getActiveTrip();
    expect(got!.legState!.currentLegIndex).toBe(1);
    expect(got!.legState!.perLeg[0].completedAt).toBeTypeOf("number");
    expect(got!.legState!.perLeg[1].enteredAt).toBeTypeOf("number");
  });
  it("collapseToFinalWalk is a no-op without itinerary/legState", () => {
    tripStore.collapseToFinalWalk({ lat: 1, lng: 1 });
    expect(tripStore.getActiveTrip()).toBeNull();
  });
  it("collapseToFinalWalk collapses remaining legs into a walk leg", async () => {
    const itinerary = makeItinerary([walkLeg(), rideLeg(), walkLeg()]);
    tripStore.setActiveTrip(
      makeTrip({
        itinerary,
        legState: { currentLegIndex: 1, perLeg: { 0: {}, 1: { enteredAt: 1 } } },
        to: { lat: 35.2, lng: 33.4, label: "Destination" },
      }),
    );
    await Promise.resolve();
    tripStore.collapseToFinalWalk({ lat: 35.15, lng: 33.35 });
    const got = tripStore.getActiveTrip();
    expect(got!.itinerary!.legs).toHaveLength(2); // slice(0,1) + finalWalk
    const last = got!.itinerary!.legs[1] as WalkLeg;
    expect(last.kind).toBe("walk");
    expect(last.to.name).toBe("Destination");
    expect(got!.legState!.currentLegIndex).toBe(1);
  });
});

describe("saved places", () => {
  const place = (overrides: Partial<SavedPlace> = {}): SavedPlace => ({
    id: "p1",
    label: "Home",
    name: "123 Main St",
    lat: 1,
    lng: 2,
    tone: "aegean",
    pinned: false,
    createdAt: Date.now(),
    ...overrides,
  });
  it("lists empty when nothing saved", () => {
    expect(tripStore.listSavedPlaces()).toEqual([]);
  });
  it("upserts a place (insert then update)", () => {
    tripStore.upsertSavedPlace(place());
    expect(tripStore.listSavedPlaces()).toHaveLength(1);
    tripStore.upsertSavedPlace(place({ label: "Home Sweet Home" }));
    const all = tripStore.listSavedPlaces();
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe("Home Sweet Home");
  });
  it("removes a place by id", () => {
    tripStore.upsertSavedPlace(place());
    tripStore.upsertSavedPlace(place({ id: "p2" }));
    tripStore.removeSavedPlace("p1");
    const all = tripStore.listSavedPlaces();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("p2");
  });
});

describe("recents", () => {
  it("lists empty when nothing recent", () => {
    expect(tripStore.listRecents()).toEqual([]);
  });
  it("pushes recents sorted by most recently used, deduping by derived id", async () => {
    tripStore.pushRecent({ name: "Place A", lat: 35.1234, lng: 33.4321 });
    await new Promise((r) => setTimeout(r, 2));
    tripStore.pushRecent({ name: "Place B", lat: 35.5, lng: 33.5 });
    let all = tripStore.listRecents();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Place B");

    // pushing same coords again dedupes and moves to front
    await new Promise((r) => setTimeout(r, 2));
    tripStore.pushRecent({ name: "Place A again", lat: 35.1234, lng: 33.4321 });
    all = tripStore.listRecents();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Place A again");
  });
  it("respects an explicit id and caps the list at 12", () => {
    for (let i = 0; i < 15; i++) {
      tripStore.pushRecent({ id: `id-${i}`, name: `Place ${i}`, lat: i, lng: i });
    }
    expect(tripStore.listRecents()).toHaveLength(12);
  });
});

describe("SSR guards (no window)", () => {
  it("read/write helpers no-op without window", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error simulate SSR
    delete globalThis.window;
    expect(tripStore.getActiveTrip()).toBeNull();
    expect(() => tripStore.setActiveTrip(makeTrip())).not.toThrow();
    globalThis.window = originalWindow;
  });
});
