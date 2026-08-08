import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const A = { lat: 35.17, lng: 33.36 };
const B = { lat: 35.185, lng: 33.375 }; // ~2km inside Nicosia
const OUTSIDE = { lat: 34.6, lng: 33.0 };

function zoneXml(id: string, name: string, lat: number, lng: number, capacity = 5) {
  return `<sharedMobility><common:identifier>${id}</common:identifier><sharedMobilityFacilityName><common:value>${name}</common:value></sharedMobilityFacilityName><capacity>${capacity}</capacity><location:pointByCoordinates><common:latitude>${lat}</common:latitude><common:longitude>${lng}</common:longitude></location:pointByCoordinates></sharedMobility>`;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let mod: typeof import("../bolt-scooter.functions");

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  mod = await import("../bolt-scooter.functions");
});

describe("loadZones", () => {
  it("parses zones from the datex feed", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => zoneXml("z1", "Zone One", A.lat, A.lng),
    });
    const zones = await mod.loadZones();
    expect(zones).toHaveLength(1);
    expect(zones[0]?.name).toBe("Zone One");
  });

  it("returns empty array on fetch failure with no cache", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const zones = await mod.loadZones();
    expect(zones).toEqual([]);
  });

  it("treats an empty parsed feed as a failure and falls back", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "<empty/>" });
    const zones = await mod.loadZones();
    expect(zones).toEqual([]);
  });
});

describe("nearestBoltZones", () => {
  it("rejects invalid input", async () => {
    await expect(
      callServerFn(mod.nearestBoltZones, { near: { lat: 1000, lng: 0 } }),
    ).rejects.toThrow();
  });

  it("returns empty array outside Nicosia", async () => {
    const out = await callServerFn(mod.nearestBoltZones, { near: OUTSIDE });
    expect(out).toEqual([]);
  });

  it("returns nearby zones sorted by distance", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => zoneXml("z1", "Zone One", A.lat, A.lng),
    });
    const out = await callServerFn(mod.nearestBoltZones, { near: A, radiusM: 500 });
    expect(out).toHaveLength(1);
    expect(out[0]?.distanceM).toBeLessThan(50);
  });
});

describe("suggestBoltScooter", () => {
  it("returns null outside Nicosia", async () => {
    const out = await callServerFn(mod.suggestBoltScooter, { from: OUTSIDE, to: OUTSIDE });
    expect(out).toBeNull();
  });

  it("returns null when OD distance is outside the sweet spot", async () => {
    const out = await callServerFn(mod.suggestBoltScooter, { from: A, to: A });
    expect(out).toBeNull();
  });

  it("returns null when the feed has no zones", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "<empty/>" });
    const out = await callServerFn(mod.suggestBoltScooter, { from: A, to: B });
    expect(out).toBeNull();
  });

  it("suggests a scoot when it beats the bus baseline", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        zoneXml("z1", "Pickup Zone", A.lat, A.lng) + zoneXml("z2", "Dropoff Zone", B.lat, B.lng),
    });
    const out = await callServerFn(mod.suggestBoltScooter, {
      from: A,
      to: B,
      busOnlyDurationSec: 5000,
    });
    expect(out?.reason).toBe("faster");
    expect(out?.pickup.id).toBe("z1");
    expect(out?.dropoff.id).toBe("z2");
  });

  it("returns no-bus-only when bus duration absent", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        zoneXml("z1", "Pickup Zone", A.lat, A.lng) + zoneXml("z2", "Dropoff Zone", B.lat, B.lng),
    });
    const out = await callServerFn(mod.suggestBoltScooter, { from: A, to: B });
    expect(out?.reason).toBe("no-bus-only");
  });

  it("returns null when bus is already fast enough", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        zoneXml("z1", "Pickup Zone", A.lat, A.lng) + zoneXml("z2", "Dropoff Zone", B.lat, B.lng),
    });
    const out = await callServerFn(mod.suggestBoltScooter, {
      from: A,
      to: B,
      busOnlyDurationSec: 10,
    });
    expect(out).toBeNull();
  });

  it("returns null when pickup and dropoff resolve to the same zone", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => zoneXml("z1", "Only Zone", A.lat, A.lng),
    });
    const out = await callServerFn(mod.suggestBoltScooter, { from: A, to: B });
    expect(out).toBeNull();
  });
});
