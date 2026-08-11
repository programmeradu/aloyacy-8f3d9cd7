import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ActiveTrip } from "@/lib/trip-store";

// __reset is a test-only extra on the stub, not on the real typing.
const reset = () => (AsyncStorage as unknown as { __reset(): void }).__reset();

async function freshModule() {
  vi.resetModules();
  reset();
  return import("@/lib/trip-store");
}

const baseTrip = (over: Partial<ActiveTrip> = {}): ActiveTrip => ({
  startedAt: Date.now(),
  option: {
    id: "opt-1",
    totalDurationSec: 600,
    departureUnix: Math.floor(Date.now() / 1000),
    arrivalUnix: Math.floor(Date.now() / 1000) + 600,
    legs: [],
    transfers: 0,
  },
  from: { lat: 35.17, lng: 33.36, label: "Nicosia" },
  to: { lat: 34.9, lng: 33.6, label: "Larnaca" },
  ...over,
});

describe("active trip persistence", () => {
  it("returns null when nothing has been set", async () => {
    const m = await freshModule();
    expect(m.getActiveTrip()).toBeNull();
  });

  it("round-trips a trip through set/get", async () => {
    const m = await freshModule();
    const trip = baseTrip();
    m.setActiveTrip(trip);
    expect(m.getActiveTrip()).toEqual(trip);
  });

  it("persists the active trip to storage so a rehydrated store finds it", async () => {
    const m = await freshModule();
    m.setActiveTrip(baseTrip({ startedAt: Date.now() }));
    await m.hydrateTripStore();
    // a second "process" reading the same storage key sees it too
    vi.resetModules();
    const m2 = await import("@/lib/trip-store");
    await m2.hydrateTripStore();
    expect(m2.getActiveTrip()).not.toBeNull();
  });

  it("clears the active trip and wipes storage", async () => {
    const m = await freshModule();
    m.setActiveTrip(baseTrip());
    m.clearActiveTrip();
    expect(m.getActiveTrip()).toBeNull();
    const raw = await AsyncStorage.getItem("aloya:active-trip");
    expect(raw).toBeNull();
  });

  it("prunes a trip older than the max age (6h) even without an expected arrival", async () => {
    const m = await freshModule();
    const old = baseTrip({ startedAt: Date.now() - 7 * 60 * 60 * 1000 });
    m.setActiveTrip(old);
    expect(m.getActiveTrip()).toBeNull();
  });

  it("keeps a trip younger than the max age with no arrival info", async () => {
    const m = await freshModule();
    const recent = baseTrip({ startedAt: Date.now() - 60_000 });
    m.setActiveTrip(recent);
    expect(m.getActiveTrip()).not.toBeNull();
  });

  it("prunes a trip whose expected arrival passed more than the grace period ago", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    const trip = baseTrip({
      startedAt: Date.now() - 30 * 60_000,
      itinerary: {
        id: "it-1",
        legs: [],
        totalDurationSec: 600,
        departureUnix: nowSec - 3 * 60 * 60,
        arrivalUnix: nowSec - 3 * 60 * 60, // arrived 3h ago, grace is 2h
        transfers: 0,
        totalWalkMeters: 0,
        score: 0,
        source: "live",
      },
    });
    m.setActiveTrip(trip);
    expect(m.getActiveTrip()).toBeNull();
  });

  it("keeps a trip whose arrival is within the grace period", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    const trip = baseTrip({
      startedAt: Date.now() - 30 * 60_000,
      itinerary: {
        id: "it-1",
        legs: [],
        totalDurationSec: 600,
        departureUnix: nowSec - 60 * 60,
        arrivalUnix: nowSec - 60 * 60, // arrived 1h ago, grace is 2h
        transfers: 0,
        totalWalkMeters: 0,
        score: 0,
        source: "live",
      },
    });
    m.setActiveTrip(trip);
    expect(m.getActiveTrip()).not.toBeNull();
  });

  it("logs a completed trip to the trip chain when clearing", async () => {
    const m = await freshModule();
    const trip = baseTrip({ live: { startedAt: Date.now(), alightedAt: Date.now() } });
    m.setActiveTrip(trip);
    m.clearActiveTrip();
    // allow the fire-and-forget dynamic import + async work to flush
    await new Promise((r) => setTimeout(r, 20));
    const chain = await import("@/lib/trip-chain");
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    expect(raw).not.toBeNull();
    void chain;
  });

  it("patches live trip state, seeding startedAt on first patch", async () => {
    const m = await freshModule();
    m.setActiveTrip(baseTrip());
    m.patchActiveTripLive({ onBoardConfirmedAt: 123 });
    const trip = m.getActiveTrip();
    expect(trip?.live?.onBoardConfirmedAt).toBe(123);
    expect(trip?.live?.startedAt).toBeTypeOf("number");
  });

  it("no-ops patchActiveTripLive when there is no active trip", async () => {
    const m = await freshModule();
    expect(() => m.patchActiveTripLive({ onBoardConfirmedAt: 1 })).not.toThrow();
    expect(m.getActiveTrip()).toBeNull();
  });
});

describe("multi-leg helpers", () => {
  const multiLegItinerary = (nowSec: number) => ({
    id: "it-multi",
    legs: [
      { kind: "ride" as const, routeId: "r1", routeShort: "1", routeLong: "One", tripId: "t1", live: true,
        board: { stopId: "a", name: "A", lat: 0, lng: 0, departureUnix: nowSec },
        alight: { stopId: "b", name: "B", lat: 0, lng: 0, arrivalUnix: nowSec + 300 },
        stopCount: 3, delaySec: 0 },
      { kind: "ride" as const, routeId: "r2", routeShort: "2", routeLong: "Two", tripId: "t2", live: true,
        board: { stopId: "b", name: "B", lat: 0, lng: 0, departureUnix: nowSec + 400 },
        alight: { stopId: "c", name: "C", lat: 0, lng: 0, arrivalUnix: nowSec + 700 },
        stopCount: 3, delaySec: 0 },
    ],
    totalDurationSec: 700,
    departureUnix: nowSec,
    arrivalUnix: nowSec + 700,
    transfers: 1,
    totalWalkMeters: 0,
    score: 0,
    source: "live" as const,
  });

  it("identifies single vs multi-leg itineraries by ride-leg count", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    expect(m.isMultiLeg(undefined)).toBe(false);
    expect(m.isMultiLeg(multiLegItinerary(nowSec))).toBe(true);
    expect(m.rideLegsOf(multiLegItinerary(nowSec))).toHaveLength(2);
  });

  it("creates an initial leg state anchored at leg 0", async () => {
    const m = await freshModule();
    const state = m.initialLegState();
    expect(state.currentLegIndex).toBe(0);
    expect(state.perLeg[0].enteredAt).toBeTypeOf("number");
  });

  it("patches the current leg's live state in place", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    m.setActiveTrip(baseTrip({ itinerary: multiLegItinerary(nowSec), legState: m.initialLegState() }));
    m.patchCurrentLeg({ onBoardConfirmedAt: 42 });
    expect(m.getActiveTrip()?.legState?.perLeg[0].onBoardConfirmedAt).toBe(42);
  });

  it("advances to the next leg, stamping completedAt / enteredAt", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    m.setActiveTrip(baseTrip({ itinerary: multiLegItinerary(nowSec), legState: m.initialLegState() }));
    m.advanceToNextLeg();
    const state = m.getActiveTrip()?.legState;
    expect(state?.currentLegIndex).toBe(1);
    expect(state?.perLeg[0].completedAt).toBeTypeOf("number");
    expect(state?.perLeg[1].enteredAt).toBeTypeOf("number");
  });

  it("refuses to advance past the final leg", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    m.setActiveTrip(baseTrip({
      itinerary: multiLegItinerary(nowSec),
      legState: { currentLegIndex: 1, perLeg: { 1: { enteredAt: Date.now() } } },
    }));
    m.advanceToNextLeg();
    expect(m.getActiveTrip()?.legState?.currentLegIndex).toBe(1);
  });

  it("collapses the remaining itinerary to a single final walk leg", async () => {
    const m = await freshModule();
    const nowSec = Math.floor(Date.now() / 1000);
    m.setActiveTrip(baseTrip({
      to: { lat: 34.9, lng: 33.6, label: "Larnaca" },
      itinerary: multiLegItinerary(nowSec),
      legState: { currentLegIndex: 1, perLeg: { 0: {}, 1: { enteredAt: Date.now() } } },
    }));
    m.collapseToFinalWalk({ lat: 34.905, lng: 33.605 });
    const trip = m.getActiveTrip();
    expect(trip?.itinerary?.legs).toHaveLength(2);
    expect(trip?.itinerary?.legs[1].kind).toBe("walk");
    expect(trip?.legState?.currentLegIndex).toBe(1);
  });

  it("no-ops multi-leg mutators when there is no active trip / legState", async () => {
    const m = await freshModule();
    expect(() => m.patchCurrentLeg({ onBoardConfirmedAt: 1 })).not.toThrow();
    expect(() => m.advanceToNextLeg()).not.toThrow();
    expect(() => m.collapseToFinalWalk({ lat: 0, lng: 0 })).not.toThrow();
  });
});

describe("saved places", () => {
  it("upserts a place, replacing any existing entry with the same id", async () => {
    const m = await freshModule();
    m.upsertSavedPlace({ id: "p1", label: "Home", name: "Home", lat: 1, lng: 1, tone: "aegean", pinned: true, createdAt: 1 });
    m.upsertSavedPlace({ id: "p1", label: "Home v2", name: "Home v2", lat: 1, lng: 1, tone: "olive", pinned: false, createdAt: 1 });
    const all = m.listSavedPlaces();
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe("Home v2");
  });

  it("removes a saved place by id", async () => {
    const m = await freshModule();
    m.upsertSavedPlace({ id: "p1", label: "Home", name: "Home", lat: 1, lng: 1, tone: "aegean", pinned: true, createdAt: 1 });
    m.removeSavedPlace("p1");
    expect(m.listSavedPlaces()).toHaveLength(0);
  });
});

describe("recent destinations", () => {
  it("dedupes by id, moving the repeated destination back to the front", async () => {
    const m = await freshModule();
    m.pushRecent({ id: "d1", name: "Alpha", lat: 1, lng: 1 });
    m.pushRecent({ id: "d2", name: "Beta", lat: 2, lng: 2 });
    m.pushRecent({ id: "d1", name: "Alpha", lat: 1, lng: 1 });
    const recents = m.listRecents();
    expect(recents).toHaveLength(2);
    expect(recents[0].id).toBe("d1");
  });

  it("derives a stable id from lat/lng when none is supplied", async () => {
    const m = await freshModule();
    m.pushRecent({ name: "Alpha", lat: 35.123456, lng: 33.654321 });
    expect(m.listRecents()[0].id).toBe("35.1235,33.6543");
  });

  it("caps the recents list at 12 entries, dropping the oldest", async () => {
    const m = await freshModule();
    for (let i = 0; i < 15; i++) {
      m.pushRecent({ id: `d${i}`, name: `Dest ${i}`, lat: i, lng: i });
    }
    const recents = m.listRecents();
    expect(recents).toHaveLength(12);
    expect(recents[0].id).toBe("d14");
    expect(recents.find((r) => r.id === "d0")).toBeUndefined();
  });
});
