import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActiveTrip } from "../trip-store";

const KEY = "aloya:trip-chain-log";

async function freshChain(seed?: Record<string, string>) {
  vi.resetModules();
  const storage = await import("../../test/stubs/async-storage");
  storage.__resetStorage(seed);
  const chain = await import("../trip-chain");
  return { chain, dumpStorage: storage.__dumpStorage };
}

const baseTrip = (overrides: Partial<ActiveTrip> = {}): ActiveTrip =>
  ({
    startedAt: 1_000,
    option: { id: "o1", totalDurationSec: 600, departureUnix: 0, arrivalUnix: 0, legs: [], transfers: 0 },
    from: { lat: 35.1, lng: 33.3, label: "A" },
    to: { lat: 35.2, lng: 33.4, label: "B" },
    ...overrides,
  }) as ActiveTrip;

describe("trip-chain", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("logCompletedTrip is silent for null/undefined/incomplete trips", async () => {
    const { chain, dumpStorage } = await freshChain();
    await chain.logCompletedTrip(null);
    await chain.logCompletedTrip(undefined);
    await chain.logCompletedTrip(baseTrip()); // no live/legState markers -> not completed
    expect(dumpStorage()[KEY]).toBeUndefined();
  });

  it("logCompletedTrip is silent when from/to coordinates are non-finite", async () => {
    const { chain, dumpStorage } = await freshChain();
    const trip = baseTrip({
      live: { startedAt: 1, alightedAt: 2 },
      from: { lat: NaN, lng: 33.3, label: "A" },
    });
    await chain.logCompletedTrip(trip);
    expect(dumpStorage()[KEY]).toBeUndefined();
  });

  it("logCompletedTrip persists a trip completed via live.alightedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T09:30:00Z"));
    const { chain, dumpStorage } = await freshChain();
    const trip = baseTrip({ live: { startedAt: 1, alightedAt: Date.now() } });
    await chain.logCompletedTrip(trip);
    const entries = JSON.parse(dumpStorage()[KEY]);
    expect(entries).toHaveLength(1);
    expect(entries[0].to).toEqual({ lat: 35.2, lng: 33.4, label: "B" });
    expect(entries[0].hour).toBe(new Date().getHours());
    vi.useRealTimers();
  });

  it("logCompletedTrip persists a trip completed via a per-leg marker (arrivedAt/completedAt)", async () => {
    const { chain, dumpStorage } = await freshChain();
    const withArrived = baseTrip({ legState: { currentLegIndex: 0, perLeg: { 0: { arrivedAt: 5 } } } });
    await chain.logCompletedTrip(withArrived);
    expect(JSON.parse(dumpStorage()[KEY])).toHaveLength(1);

    const { chain: chain2 } = await freshChain();
    const withCompleted = baseTrip({ legState: { currentLegIndex: 1, perLeg: { 0: { completedAt: 5 }, 1: {} } } });
    await chain2.logCompletedTrip(withCompleted);
  });

  it("dedupes by id (same startedAt+destination) and caps at MAX_ENTRIES (25)", async () => {
    const { chain, dumpStorage } = await freshChain();
    for (let i = 0; i < 27; i++) {
      await chain.logCompletedTrip(
        baseTrip({ startedAt: i, live: { startedAt: 1, alightedAt: 2 }, to: { lat: 35.2 + i * 0.001, lng: 33.4, label: `B${i}` } }),
      );
    }
    const entries = JSON.parse(dumpStorage()[KEY]);
    expect(entries).toHaveLength(25);
    // newest first
    expect(entries[0].to.label).toBe("B26");

    // logging the exact same trip again (same startedAt+to) replaces, doesn't duplicate
    await chain.logCompletedTrip(baseTrip({ startedAt: 26, live: { startedAt: 1, alightedAt: 2 }, to: { lat: 35.2 + 26 * 0.001, lng: 33.4, label: "B26-again" } }));
    const after = JSON.parse(dumpStorage()[KEY]);
    expect(after).toHaveLength(25);
    expect(after[0].to.label).toBe("B26-again");
  });

  it("clearTripChainLog empties the log and persists", async () => {
    const { chain, dumpStorage } = await freshChain();
    await chain.logCompletedTrip(baseTrip({ live: { startedAt: 1, alightedAt: 2 } }));
    await chain.clearTripChainLog();
    expect(JSON.parse(dumpStorage()[KEY])).toEqual([]);
  });

  it("hydrate recovers from malformed JSON without throwing", async () => {
    const { chain } = await freshChain({ [KEY]: "not json" });
    await chain.logCompletedTrip(baseTrip({ live: { startedAt: 1, alightedAt: 2 } }));
    // if hydrate had thrown, this would never resolve/persist
  });

  describe("pickReturnSuggestion", () => {
    const here = { lat: 35.2, lng: 33.4, label: "Here" };
    const now = new Date("2024-01-01T18:00:00Z");

    it("returns null with no entries or no location", async () => {
      const { chain } = await freshChain();
      expect(chain.pickReturnSuggestion([], here, now)).toBeNull();
      expect(chain.pickReturnSuggestion([{ id: "x", from: here, to: here, completedAt: 0, hour: 0 }], null, now)).toBeNull();
    });

    it("filters out candidates too far from `here`", async () => {
      const { chain } = await freshChain();
      const entries = [
        { id: "c1", from: { lat: 35.1, lng: 33.3, label: "A" }, to: { lat: 10, lng: 10, label: "Far" }, completedAt: now.getTime() - 2 * 3_600_000, hour: 16 },
      ];
      expect(chain.pickReturnSuggestion(entries, here, now)).toBeNull();
    });

    it("filters out candidates outside the return window or too recent", async () => {
      const { chain } = await freshChain();
      const tooOld = [
        { id: "c1", from: { lat: 35.1, lng: 33.3, label: "A" }, to: here, completedAt: now.getTime() - 20 * 3_600_000, hour: 16 },
      ];
      expect(chain.pickReturnSuggestion(tooOld, here, now)).toBeNull();

      const tooRecent = [
        { id: "c2", from: { lat: 35.1, lng: 33.3, label: "A" }, to: here, completedAt: now.getTime() - 60_000, hour: 18 },
      ];
      expect(chain.pickReturnSuggestion(tooRecent, here, now)).toBeNull();
    });

    it("suggests the reverse leg without history ('Return the way you came?')", async () => {
      const { chain } = await freshChain();
      const entries = [
        {
          id: "c1",
          from: { lat: 35.1, lng: 33.3, label: "Nicosia" },
          to: here,
          completedAt: now.getTime() - 2 * 3_600_000,
          hour: 16,
        },
      ];
      const suggestion = chain.pickReturnSuggestion(entries, here, now);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.from).toEqual(here);
      expect(suggestion?.to).toEqual({ lat: 35.1, lng: 33.3, label: "Nicosia" });
      expect(suggestion?.usualReturnTime).toBeNull();
      expect(suggestion?.reason).toBe("Return the way you came?");
    });

    it("boosts score and surfaces a typical return time when opposite-direction history exists", async () => {
      const { chain } = await freshChain();
      const origin = { lat: 35.1, lng: 33.3, label: "Nicosia" };
      const entries = [
        { id: "c1", from: origin, to: here, completedAt: now.getTime() - 2 * 3_600_000, hour: 16 },
        // Opposite direction (here -> origin) completed previously at the current hour.
        { id: "c2", from: here, to: origin, completedAt: now.getTime() - 24 * 3_600_000, hour: now.getHours() },
      ];
      const suggestion = chain.pickReturnSuggestion(entries, here, now);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.reason).toBe("You usually head back around now");
      expect(suggestion?.usualReturnTime).toBe(`${String(now.getHours()).padStart(2, "0")}:00`);
    });
  });
});
