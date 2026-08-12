import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPlan } from "../plan";

afterEach(() => vi.unstubAllGlobals());

const args = { from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } };

describe("fetchPlan", () => {
  it("shapes ok response", async () => {
    const plan = { itineraries: [], searchedAt: 1, elapsedMs: 5, mode: "live" as const };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => plan }));
    const res = await fetchPlan(args);
    expect(res).toEqual(plan);
  });

  it("throws with truncated body text on a non-retried 4xx", async () => {
    // 500 is retried across every base by fetchPublicApi, so its own
    // aggregate error would win instead of fetchPlan's; use a 4xx (returned
    // immediately, no retry) to exercise fetchPlan's own error formatting.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "x".repeat(300) }),
    );
    await expect(fetchPlan(args)).rejects.toThrow(/Plan 400: x{200}$/);
  });

  it("throws the aggregate fetchPublicApi error once every base 5xxs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "x".repeat(300) }),
    );
    await expect(fetchPlan(args)).rejects.toThrow(/returned 500/);
  });

  it("falls back to empty text when .text() rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => { throw new Error("no body"); } }),
    );
    await expect(fetchPlan(args)).rejects.toThrow("Plan 400: ");
  });

  it("retries fallback base on network rejection", async () => {
    const plan = { itineraries: [], searchedAt: 1, elapsedMs: 5, mode: "scheduled" as const };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("dns"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => plan });
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchPlan(args);
    expect(res).toEqual(plan);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propagates malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }),
    );
    await expect(fetchPlan(args)).rejects.toThrow("bad json");
  });
});
