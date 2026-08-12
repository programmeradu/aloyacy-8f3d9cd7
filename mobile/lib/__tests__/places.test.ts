import { describe, it, expect, vi, afterEach } from "vitest";
import { autocompletePlaces, resolvePlace } from "../places";

afterEach(() => vi.unstubAllGlobals());

describe("autocompletePlaces", () => {
  it("returns suggestions on ok", async () => {
    const suggestions = [{ placeId: "1", primary: "A", secondary: "B" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions }) }));
    const res = await autocompletePlaces({ query: "a" });
    expect(res).toEqual(suggestions);
  });

  it("defaults to [] when suggestions missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    const res = await autocompletePlaces({ query: "a" });
    expect(res).toEqual([]);
  });

  it("throws on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(autocompletePlaces({ query: "a" })).rejects.toThrow("Autocomplete 500");
  });

  it("rejects on network failure (no fallback retry — single base)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(autocompletePlaces({ query: "a" })).rejects.toThrow("offline");
  });
});

describe("resolvePlace", () => {
  it("returns place on ok", async () => {
    const place = { placeId: "1", name: "A", address: "B", lat: 1, lng: 2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => place }));
    const res = await resolvePlace("1");
    expect(res).toEqual(place);
  });

  it("throws on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(resolvePlace("1")).rejects.toThrow("Place 404");
  });

  it("propagates malformed json", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad"); } }));
    await expect(resolvePlace("1")).rejects.toThrow("bad");
  });
});
