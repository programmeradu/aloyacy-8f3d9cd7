import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const HUB = { lat: 35.17, lng: 33.36 };

function stationXml(opts: {
  id: string;
  lat: number;
  lng: number;
  capacity?: number;
  statuses?: string[];
  power?: number;
}) {
  const statuses = (opts.statuses ?? [])
    .map((s) => `<availabilityStatus>${s}</availabilityStatus>`)
    .join("");
  return `<energyInfrastructureSite><common:identifier>${opts.id}</common:identifier><name><common:value>Charger ${opts.id}</common:value></name><operator><common:value>EAC</common:value></operator><common:latitude>${opts.lat}</common:latitude><common:longitude>${opts.lng}</common:longitude><capacity>${opts.capacity ?? 2}</capacity>${statuses}<maximumPowerAtSocket>${opts.power ?? 22}</maximumPowerAtSocket></energyInfrastructureSite>`;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let mod: typeof import("../ev-chargers.functions");

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  mod = await import("../ev-chargers.functions");
});

describe("nearestEvChargers", () => {
  it("rejects invalid input", async () => {
    await expect(
      callServerFn(mod.nearestEvChargers, { near: { lat: 1000, lng: 0 } }),
    ).rejects.toThrow();
  });

  it("returns live:false with empty stations when the feed is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const out = await callServerFn(mod.nearestEvChargers, { near: HUB });
    expect(out).toEqual({ stations: [], live: false });
  });

  it("returns nearby stations with live availability parsed", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        stationXml({
          id: "s1",
          lat: HUB.lat,
          lng: HUB.lng,
          capacity: 2,
          statuses: ["available", "occupied"],
          power: 50,
        }),
    });
    const out = await callServerFn(mod.nearestEvChargers, { near: HUB, radiusM: 500 });
    expect(out.live).toBe(true);
    expect(out.stations).toHaveLength(1);
    expect(out.stations[0]?.available).toBe(1);
    expect(out.stations[0]?.kind).toBe("dc");
  });

  it("respects the radius filter", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => stationXml({ id: "far", lat: HUB.lat + 1, lng: HUB.lng + 1 }),
    });
    const out = await callServerFn(mod.nearestEvChargers, { near: HUB, radiusM: 100 });
    expect(out.stations).toHaveLength(0);
  });
});

describe("liveEvForHub", () => {
  it("returns null when the feed is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const out = await mod.liveEvForHub(HUB);
    expect(out).toBeNull();
  });

  it("returns null when no station is within the match radius", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => stationXml({ id: "far", lat: HUB.lat + 1, lng: HUB.lng }),
    });
    const out = await mod.liveEvForHub(HUB);
    expect(out).toBeNull();
  });

  it("aggregates nearby stations with live status", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        stationXml({
          id: "s1",
          lat: HUB.lat,
          lng: HUB.lng,
          capacity: 3,
          statuses: ["available", "available", "occupied"],
          power: 60,
        }) + stationXml({ id: "s2", lat: HUB.lat, lng: HUB.lng, capacity: 2, power: 11 }),
    });
    const out = await mod.liveEvForHub(HUB);
    expect(out?.total).toBe(5);
    expect(out?.available).toBe(2);
    expect(out?.kind).toBe("dc");
    expect(out?.operator).toBe("EAC");
  });

  it("reports available:null when no station in range publishes live status", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => stationXml({ id: "s1", lat: HUB.lat, lng: HUB.lng, capacity: 4 }),
    });
    const out = await mod.liveEvForHub(HUB);
    expect(out?.available).toBeNull();
    expect(out?.total).toBe(4);
  });
});
