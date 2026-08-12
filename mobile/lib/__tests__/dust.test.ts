import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDustAdvisory } from "../dust";

afterEach(() => vi.unstubAllGlobals());

const args = { lat: 1, lng: 2 };

describe("fetchDustAdvisory", () => {
  it("returns advisory when severity present", async () => {
    const advisory = { severity: "haze", zone: "z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => advisory }));
    const res = await fetchDustAdvisory(args);
    expect(res).toEqual(advisory);
  });

  it("returns null when json lacks severity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foo: "bar" }) }));
    const res = await fetchDustAdvisory(args);
    expect(res).toBeNull();
  });

  it("returns null when json is null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => null }));
    const res = await fetchDustAdvisory(args);
    expect(res).toBeNull();
  });

  it("returns null on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = await fetchDustAdvisory(args);
    expect(res).toBeNull();
  });

  it("returns null on network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await fetchDustAdvisory(args);
    expect(res).toBeNull();
  });
});
