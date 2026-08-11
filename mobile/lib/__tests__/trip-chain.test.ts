import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  logCompletedTrip,
  pickReturnSuggestion,
  clearTripChainLog,
  type ChainEntry,
} from "@/lib/trip-chain";
import type { ActiveTrip } from "@/lib/trip-store";

const reset = () => (AsyncStorage as unknown as { __reset(): void }).__reset();

beforeEach(async () => {
  reset();
  await clearTripChainLog();
});

const trip = (over: Partial<ActiveTrip> = {}): ActiveTrip => ({
  startedAt: Date.now() - 60_000,
  option: {
    id: "opt",
    totalDurationSec: 600,
    departureUnix: 0,
    arrivalUnix: 0,
    legs: [],
    transfers: 0,
  },
  from: { lat: 35.17, lng: 33.36, label: "Nicosia" },
  to: { lat: 34.9, lng: 33.6, label: "Larnaca" },
  live: { startedAt: Date.now(), alightedAt: Date.now() },
  ...over,
});

describe("logCompletedTrip", () => {
  it("silently skips a trip that never completed", async () => {
    await logCompletedTrip(trip({ live: { startedAt: Date.now() } }));
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    expect(raw).toBeNull();
  });

  it("skips null/undefined trips", async () => {
    await expect(logCompletedTrip(null)).resolves.toBeUndefined();
    await expect(logCompletedTrip(undefined)).resolves.toBeUndefined();
  });

  it("skips trips with non-finite coordinates", async () => {
    await logCompletedTrip(trip({ from: { lat: NaN, lng: 33.36, label: "?" } }));
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    expect(raw).toBeNull();
  });

  it("logs a trip completed via live.alightedAt", async () => {
    await logCompletedTrip(trip());
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    expect(raw).not.toBeNull();
    const entries = JSON.parse(raw!) as ChainEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].to.label).toBe("Larnaca");
  });

  it("logs a trip completed via a leg-level marker (arrivedAt/completedAt/alightedAt)", async () => {
    await logCompletedTrip(
      trip({
        live: { startedAt: Date.now() },
        legState: { currentLegIndex: 1, perLeg: { 0: { completedAt: Date.now() }, 1: { arrivedAt: Date.now() } } },
      }),
    );
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    expect(raw).not.toBeNull();
  });

  it("dedupes on the same id (same startedAt + destination), keeping only the latest write", async () => {
    const t = trip({ startedAt: 12345 });
    await logCompletedTrip(t);
    await logCompletedTrip(t);
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    const entries = JSON.parse(raw!) as ChainEntry[];
    expect(entries).toHaveLength(1);
  });

  it("caps the log at 25 entries", async () => {
    for (let i = 0; i < 30; i++) {
      await logCompletedTrip(trip({ startedAt: i }));
    }
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    const entries = JSON.parse(raw!) as ChainEntry[];
    expect(entries.length).toBeLessThanOrEqual(25);
  });
});

describe("pickReturnSuggestion", () => {
  const nicosia = { lat: 35.17, lng: 33.36 };
  const larnaca = { lat: 34.9, lng: 33.6 };

  const entry = (over: Partial<ChainEntry> = {}): ChainEntry => ({
    id: "e1",
    from: { lat: nicosia.lat, lng: nicosia.lng, label: "Nicosia" },
    to: { lat: larnaca.lat, lng: larnaca.lng, label: "Larnaca" },
    completedAt: Date.now() - 60 * 60_000,
    hour: new Date(Date.now() - 60 * 60_000).getHours(),
    ...over,
  });

  it("returns null with no entries or no location", () => {
    expect(pickReturnSuggestion([], larnaca)).toBeNull();
    expect(pickReturnSuggestion([entry()], null)).toBeNull();
  });

  it("suggests the reverse trip when the rider is near where they arrived", () => {
    const suggestion = pickReturnSuggestion([entry()], larnaca);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.from.label).toBe("Larnaca");
    expect(suggestion!.to.label).toBe("Nicosia");
  });

  it("does not suggest anything when the rider is already near the origin (not the destination)", () => {
    expect(pickReturnSuggestion([entry()], nicosia)).toBeNull();
  });

  it("excludes trips completed outside the return window (>14h ago)", () => {
    const stale = entry({ completedAt: Date.now() - 15 * 60 * 60_000 });
    expect(pickReturnSuggestion([stale], larnaca)).toBeNull();
  });

  it("excludes trips completed less than 15 minutes ago", () => {
    const veryRecent = entry({ completedAt: Date.now() - 60_000 });
    expect(pickReturnSuggestion([veryRecent], larnaca)).toBeNull();
  });

  it("prefers a candidate matching the rider's usual return hour", () => {
    const now = new Date();
    const matchingHourEntries: ChainEntry[] = [
      entry({ id: "outbound", completedAt: Date.now() - 2 * 60 * 60_000 }),
      // three "opposite direction" historical trips at the current hour
      entry({
        id: "hist1",
        from: { lat: larnaca.lat, lng: larnaca.lng, label: "Larnaca" },
        to: { lat: nicosia.lat, lng: nicosia.lng, label: "Nicosia" },
        completedAt: Date.now() - 5 * 24 * 60 * 60_000,
        hour: now.getHours(),
      }),
      entry({
        id: "hist2",
        from: { lat: larnaca.lat, lng: larnaca.lng, label: "Larnaca" },
        to: { lat: nicosia.lat, lng: nicosia.lng, label: "Nicosia" },
        completedAt: Date.now() - 6 * 24 * 60 * 60_000,
        hour: now.getHours(),
      }),
    ];
    const suggestion = pickReturnSuggestion(matchingHourEntries, larnaca, now);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.usualReturnTime).toBe(`${String(now.getHours()).padStart(2, "0")}:00`);
    expect(suggestion!.reason).toBe("You usually head back around now");
  });

  it("falls back to a generic reason when there's no return-hour history", () => {
    const suggestion = pickReturnSuggestion([entry({ completedAt: Date.now() - 60 * 60_000 })], larnaca);
    expect(suggestion?.reason).toBe("Return the way you came?");
    expect(suggestion?.usualReturnTime).toBeNull();
  });

  it("uses the generic 'Back to your origin?' reason once outside the 4h recency window", () => {
    const suggestion = pickReturnSuggestion([entry({ completedAt: Date.now() - 6 * 60 * 60_000 })], larnaca);
    expect(suggestion?.reason).toBe("Back to your origin?");
  });
});

describe("clearTripChainLog", () => {
  it("wipes the persisted log", async () => {
    await logCompletedTrip(trip());
    await clearTripChainLog();
    const raw = await AsyncStorage.getItem("aloya:trip-chain-log");
    expect(JSON.parse(raw!)).toEqual([]);
  });
});
