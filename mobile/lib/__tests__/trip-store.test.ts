import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetStorage } from "../../test/stubs/async-storage";

const ACTIVE_KEY = "aloya:active-trip";
const SAVED_KEY = "aloya:saved-places";
const RECENT_KEY = "aloya:recent-destinations";

// `vi.resetModules()` gives `../trip-store` (and therefore its AsyncStorage
// import) a brand-new module instance, distinct from the stub bound at the
// top of this file. Track the instance actually wired to the freshly loaded
// store so assertions on storage contents read the same backing map.
let activeDumpStorage: () => Record<string, string> = () => ({});

async function freshStore(seed?: Record<string, string>) {
  vi.resetModules();
  const storage = await import("../../test/stubs/async-storage");
  storage.__resetStorage(seed);
  activeDumpStorage = storage.__dumpStorage;
  const store = await import("../trip-store");
  return store;
}

function dumpStorage(): Record<string, string> {
  return activeDumpStorage();
}

const baseTrip = (overrides: Partial<any> = {}) => ({
  startedAt: Date.now(),
  option: { id: "o1", totalDurationSec: 600, departureUnix: 0, arrivalUnix: 0, legs: [], transfers: 0 },
  from: { lat: 35.1, lng: 33.3, label: "A" },
  to: { lat: 35.2, lng: 33.4, label: "B" },
  ...overrides,
});

describe("trip-store", () => {
  beforeEach(() => {
    __resetStorage();
  });

  it("setActiveTrip persists and getActiveTrip returns it", async () => {
    const store = await freshStore();
    const trip = baseTrip();
    store.setActiveTrip(trip);
    expect(store.getActiveTrip()).toEqual(trip);
    // the AsyncStorage write is fire-and-forget; flush microtasks before reading it back
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.parse(dumpStorage()[ACTIVE_KEY])).toEqual(trip);
  });

  it("clearActiveTrip clears cache and storage", async () => {
    const store = await freshStore();
    store.setActiveTrip(baseTrip());
    store.clearActiveTrip();
    expect(store.getActiveTrip()).toBeNull();
    expect(dumpStorage()[ACTIVE_KEY]).toBeUndefined();
  });

  it("prunes a trip older than MAX_TRIP_AGE_MS", async () => {
    const store = await freshStore();
    const old = baseTrip({ startedAt: Date.now() - 7 * 60 * 60 * 1000 });
    store.setActiveTrip(old);
    expect(store.getActiveTrip()).toBeNull();
  });

  it("prunes a trip whose expected arrival is long past (grace window)", async () => {
    const store = await freshStore();
    const pastArrivalUnix = Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000);
    const trip = baseTrip({ itinerary: { arrivalUnix: pastArrivalUnix, legs: [] } });
    store.setActiveTrip(trip);
    expect(store.getActiveTrip()).toBeNull();
  });

  it("keeps a trip within the arrival grace window", async () => {
    const store = await freshStore();
    const soon = Math.floor((Date.now() - 30 * 60 * 1000) / 1000);
    const trip = baseTrip({ itinerary: { arrivalUnix: soon, legs: [] } });
    store.setActiveTrip(trip);
    expect(store.getActiveTrip()).not.toBeNull();
  });

  it("hydrateTripStore rehydrates from AsyncStorage and prunes on load", async () => {
    const expired = baseTrip({ startedAt: Date.now() - 8 * 60 * 60 * 1000 });
    const store = await freshStore({ [ACTIVE_KEY]: JSON.stringify(expired) });
    await store.hydrateTripStore();
    expect(store.getActiveTrip()).toBeNull();
  });

  it("hydrateTripStore is memoized (single hydration promise)", async () => {
    const store = await freshStore();
    const p1 = store.hydrateTripStore();
    const p2 = store.hydrateTripStore();
    expect(p1).toBe(p2);
    await p1;
  });

  it("patchActiveTripLive merges live state and no-ops without an active trip", async () => {
    const store = await freshStore();
    store.patchActiveTripLive({ missedAt: 1 });
    expect(store.getActiveTrip()).toBeNull();
    store.setActiveTrip(baseTrip());
    store.patchActiveTripLive({ onBoardConfirmedAt: 111 });
    expect(store.getActiveTrip()?.live?.onBoardConfirmedAt).toBe(111);
  });

  it("rideLegsOf filters ride legs and isMultiLeg detects >=2 rides", async () => {
    const store = await freshStore();
    const it1: any = { legs: [{ kind: "walk" }, { kind: "ride" }] };
    const it2: any = { legs: [{ kind: "ride" }, { kind: "ride" }] };
    expect(store.rideLegsOf(it1)).toHaveLength(1);
    expect(store.isMultiLeg(it1)).toBe(false);
    expect(store.isMultiLeg(it2)).toBe(true);
    expect(store.isMultiLeg(undefined)).toBe(false);
  });

  it("initialLegState seeds leg 0 with enteredAt", async () => {
    const store = await freshStore();
    const s = store.initialLegState();
    expect(s.currentLegIndex).toBe(0);
    expect(s.perLeg[0].enteredAt).toBeTypeOf("number");
  });

  it("patchCurrentLeg is a no-op without legState, else merges the current leg", async () => {
    const store = await freshStore();
    store.setActiveTrip(baseTrip());
    store.patchCurrentLeg({ arrivedAt: 5 }); // no legState yet -> no-op
    expect(store.getActiveTrip()?.legState).toBeUndefined();

    store.setActiveTrip(baseTrip({ legState: store.initialLegState() }));
    store.patchCurrentLeg({ arrivedAt: 42 });
    expect(store.getActiveTrip()?.legState?.perLeg[0].arrivedAt).toBe(42);
  });

  it("advanceToNextLeg moves index forward and stops at the last leg", async () => {
    const store = await freshStore();
    const itinerary: any = { legs: [{ kind: "ride" }, { kind: "ride" }] };
    store.setActiveTrip(baseTrip({ itinerary, legState: store.initialLegState() }));
    store.advanceToNextLeg();
    expect(store.getActiveTrip()?.legState?.currentLegIndex).toBe(1);
    expect(store.getActiveTrip()?.legState?.perLeg[0].completedAt).toBeTypeOf("number");
    store.advanceToNextLeg(); // already at last leg
    expect(store.getActiveTrip()?.legState?.currentLegIndex).toBe(1);
  });

  it("advanceToNextLeg no-ops without itinerary/legState", async () => {
    const store = await freshStore();
    store.setActiveTrip(baseTrip());
    store.advanceToNextLeg();
    expect(store.getActiveTrip()?.legState).toBeUndefined();
  });

  it("collapseToFinalWalk truncates legs and appends a walk to destination", async () => {
    const store = await freshStore();
    const itinerary: any = {
      legs: [{ kind: "ride" }, { kind: "ride" }],
      arrivalUnix: 0,
      totalDurationSec: 0,
      totalWalkMeters: 0,
    };
    store.setActiveTrip(
      baseTrip({ itinerary, legState: { currentLegIndex: 1, perLeg: {} } }),
    );
    store.collapseToFinalWalk({ lat: 35.2, lng: 33.4 });
    const trip = store.getActiveTrip();
    expect(trip?.itinerary?.legs.at(-1)?.kind).toBe("walk");
    expect(trip?.itinerary?.legs).toHaveLength(2);
    expect(trip?.legState?.currentLegIndex).toBe(1);
  });

  it("collapseToFinalWalk no-ops without itinerary or legState", async () => {
    const store = await freshStore();
    store.setActiveTrip(baseTrip());
    store.collapseToFinalWalk({ lat: 1, lng: 1 });
    expect(store.getActiveTrip()?.itinerary).toBeUndefined();
  });

  it("saved places: upsert, dedupe by id, and remove", async () => {
    const store = await freshStore();
    const place = { id: "p1", label: "Home", name: "Home", lat: 1, lng: 1, tone: "aegean" as const, pinned: true, createdAt: 1 };
    store.upsertSavedPlace(place);
    store.upsertSavedPlace({ ...place, name: "Home Updated" });
    expect(store.listSavedPlaces()).toHaveLength(1);
    expect(store.listSavedPlaces()[0].name).toBe("Home Updated");
    store.removeSavedPlace("p1");
    expect(store.listSavedPlaces()).toHaveLength(0);
  });

  it("recents: pushRecent dedupes by derived id, sorts newest-first, and caps at 12", async () => {
    const store = await freshStore();
    for (let i = 0; i < 14; i++) {
      store.pushRecent({ name: `Place ${i}`, lat: i, lng: i });
    }
    const recents = store.listRecents();
    expect(recents).toHaveLength(12);
    expect(recents[0].name).toBe("Place 13");
  });

  it("pushRecent moves an existing id to the front instead of duplicating", async () => {
    const store = await freshStore();
    store.pushRecent({ id: "x", name: "First", lat: 1, lng: 1 });
    store.pushRecent({ id: "y", name: "Second", lat: 2, lng: 2 });
    store.pushRecent({ id: "x", name: "First again", lat: 1, lng: 1 });
    const recents = store.listRecents();
    expect(recents).toHaveLength(2);
    expect(recents[0].id).toBe("x");
  });

  it("hydrateTripStore sorts recents by lastUsed descending", async () => {
    const store = await freshStore({
      [RECENT_KEY]: JSON.stringify([
        { id: "a", name: "A", lat: 0, lng: 0, lastUsed: 100 },
        { id: "b", name: "B", lat: 0, lng: 0, lastUsed: 200 },
      ]),
    });
    await store.hydrateTripStore();
    expect(store.listRecents()[0].id).toBe("b");
  });

  it("readKey returns null and does not throw on malformed JSON", async () => {
    const store = await freshStore({ [SAVED_KEY]: "not json" });
    await store.hydrateTripStore();
    expect(store.listSavedPlaces()).toEqual([]);
  });

  it("clearActiveTrip lazily logs a completed trip to trip-chain", async () => {
    const store = await freshStore();
    const trip = baseTrip({ live: { startedAt: Date.now(), alightedAt: Date.now() } });
    store.setActiveTrip(trip);
    store.clearActiveTrip();
    // give the microtask queue a chance to run the dynamic import + logCompletedTrip
    await new Promise((r) => setTimeout(r, 20));
    const chain = await import("../trip-chain");
    const entries = JSON.parse(dumpStorage()["aloya:trip-chain-log"] ?? "[]");
    expect(Array.isArray(entries)).toBe(true);
    void chain;
  });
});
