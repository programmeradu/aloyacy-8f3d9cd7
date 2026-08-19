import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";

const drivingRouteMock = vi.fn();
vi.mock("../maps.server", () => ({
  drivingRoute: (...args: unknown[]) => drivingRouteMock(...args),
}));

const { suggestLastMileChain } = await import("../last-mile-chain.functions");

// Nicosia-ish coordinates a couple of km apart.
const ALIGHT = { lat: 35.17, lng: 33.36, name: "Alight Stop" };
const NEAR_DEST = { lat: 35.171, lng: 33.361, name: "Near Dest" }; // short walk
const FAR_DEST = { lat: 35.2, lng: 33.4, name: "Far Dest" }; // long walk (>1.5km)

// A weekday noon UNIX timestamp (not late night) and a late-night one.
const DAY_UNIX = Math.floor(new Date("2024-06-10T12:00:00Z").getTime() / 1000); // ~15:00 Nicosia
const LATE_UNIX = Math.floor(new Date("2024-06-10T21:30:00Z").getTime() / 1000); // ~00:30 Nicosia next day

describe("suggestLastMileChain", () => {
  beforeEach(() => {
    drivingRouteMock.mockReset();
  });

  it("rejects invalid input", async () => {
    await expect(
      callServerFn(suggestLastMileChain, { alight: { lat: 0, lng: 0 }, destination: ALIGHT }),
    ).rejects.toThrow();
  });

  it("returns null when the walk is short and not late", async () => {
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: NEAR_DEST,
      arrivalUnix: DAY_UNIX,
    });
    expect(out).toBeNull();
    expect(drivingRouteMock).not.toHaveBeenCalled();
  });

  it("triggers late-night for a moderate walk after hours", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 300, distanceMeters: 900 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: { lat: 35.178, lng: 33.368, name: "Moderate Dest" },
      arrivalUnix: LATE_UNIX,
    });
    expect(out?.trigger).toBe("late-night");
    expect(out?.isNightRate).toBe(true);
  });

  it("triggers long-walk during the day", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 2500 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: FAR_DEST,
      arrivalUnix: DAY_UNIX,
    });
    expect(out?.trigger).toBe("long-walk");
    expect(out?.isNightRate).toBe(false);
    expect(out?.fareLow).toBeLessThanOrEqual(out!.fareHigh);
  });

  it("triggers long-late when walk is long and it's late", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 500, distanceMeters: 3000 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: FAR_DEST,
      arrivalUnix: LATE_UNIX,
    });
    expect(out?.trigger).toBe("long-late");
  });

  it("uses finalWalkMeters when provided instead of haversine", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 2000 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: NEAR_DEST, // would be a short walk by haversine
      finalWalkMeters: 2000, // but caller says it's long
      arrivalUnix: DAY_UNIX,
    });
    expect(out?.trigger).toBe("long-walk");
  });

  it("returns null when driving ETA is unavailable", async () => {
    drivingRouteMock.mockResolvedValue(null);
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: FAR_DEST,
      arrivalUnix: DAY_UNIX,
    });
    expect(out).toBeNull();
  });

  it("returns null when the driving duration is implausibly short", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 5, distanceMeters: 2500 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: FAR_DEST,
      arrivalUnix: DAY_UNIX,
    });
    expect(out).toBeNull();
  });

  it("returns null when the driving distance is trivially small", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 200, distanceMeters: 400 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: FAR_DEST,
      arrivalUnix: DAY_UNIX,
    });
    expect(out).toBeNull();
  });

  it("defaults arrivalUnix to now when omitted and still returns a suggestion", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 400, distanceMeters: 2500 });
    const out = await callServerFn(suggestLastMileChain, {
      alight: ALIGHT,
      destination: FAR_DEST,
    });
    expect(out?.trigger).toBe("long-walk");
    expect(out?.boltDeepLink).toContain("bolt.eu");
    expect(out?.mapsDeepLink).toContain("google.com/maps");
    expect(out?.telDispatcher).toBe("+35777777474");
  });
});
