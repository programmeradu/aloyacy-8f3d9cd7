import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function freshModule() {
  vi.resetModules();
  return import("../headsigns");
}

describe("headsigns", () => {
  it("getHeadsignSync returns null before the index loads", async () => {
    const m = await freshModule();
    expect(m.getHeadsignSync("t1", "r1")).toBeNull();
  });

  it("getHeadsignSync returns null for an empty tripId even after load", async () => {
    const m = await freshModule();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.getHeadsignSync("", "r1")).toBeNull();
  });

  it("loads the index, notifies listeners once, and resolves headsigns by route+trip", async () => {
    const m = await freshModule();
    const bundle = { trips: { t1: 0 }, headsigns: ["Limassol"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ r1: bundle }) }));
    const fn = vi.fn();
    const unsub = m.onHeadsignsLoaded(fn);
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(m.getHeadsignSync("t1", "r1")).toBe("Limassol");
    unsub();
  });

  it("falls back to scanning every route when routeId is omitted or missed", async () => {
    const m = await freshModule();
    const bundle = { trips: { t1: 0 }, headsigns: ["Paphos"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ r9: bundle }) }));
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.getHeadsignSync("t1")).toBe("Paphos");
    expect(m.getHeadsignSync("t1", "wrong-route")).toBe("Paphos");
  });

  it("returns the sole headsign when the trip index is missing but only one headsign exists", async () => {
    const m = await freshModule();
    const bundle = { trips: {}, headsigns: ["Only One"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ r1: bundle }) }));
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.getHeadsignSync("unknown-trip", "r1")).toBe("Only One");
  });

  it("returns null when the trip index is missing and multiple headsigns exist", async () => {
    const m = await freshModule();
    const bundle = { trips: {}, headsigns: ["A", "B"] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ r1: bundle }) }));
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.getHeadsignSync("unknown-trip", "r1")).toBeNull();
  });

  it("caches an empty index and calls fn synchronously on non-ok response, and again on next subscribe", async () => {
    const m = await freshModule();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.getHeadsignSync("t1", "r1")).toBeNull();
    const fn = vi.fn();
    m.onHeadsignsLoaded(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("degrades to an empty index when fetch rejects", async () => {
    const m = await freshModule();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.getHeadsignSync("t1", "r1")).toBeNull();
  });

  it("dedupes concurrent loads into a single fetch (inflight reuse)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const m = await freshModule();
    vi.stubGlobal("fetch", fetchMock);
    m.prefetchHeadsigns();
    m.prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
