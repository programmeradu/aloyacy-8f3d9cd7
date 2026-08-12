import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchParkAndRide } from "../pnr";

afterEach(() => vi.unstubAllGlobals());

const args = {
  from: { lat: 1, lng: 2 },
  to: { lat: 3, lng: 4 },
  busOnlyDurationSec: 1000,
  busOnlyAccessWalkM: 200,
};

describe("fetchParkAndRide", () => {
  it("returns the suggestion on ok", async () => {
    const sugg = { reason: "faster" } as any;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => sugg }));
    const res = await fetchParkAndRide(args);
    expect(res).toEqual(sugg);
  });

  it("returns null on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = await fetchParkAndRide(args);
    expect(res).toBeNull();
  });

  it("returns null on network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await fetchParkAndRide(args);
    expect(res).toBeNull();
  });

  it("returns null when json() rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad"); } }));
    const res = await fetchParkAndRide(args);
    expect(res).toBeNull();
  });
});
