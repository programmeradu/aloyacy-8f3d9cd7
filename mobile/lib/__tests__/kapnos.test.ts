import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchKapnos } from "../kapnos";

afterEach(() => vi.unstubAllGlobals());

const args = { from: { lat: 1, lng: 2 }, to: { lat: 3, lng: 4 } };

describe("fetchKapnos", () => {
  it("returns suggestion on ok", async () => {
    const sugg = { routeId: "r1" } as any;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => sugg }));
    const res = await fetchKapnos(args);
    expect(res).toEqual(sugg);
  });

  it("returns null on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = await fetchKapnos(args);
    expect(res).toBeNull();
  });

  it("returns null on network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await fetchKapnos(args);
    expect(res).toBeNull();
  });

  it("returns null when malformed json throws (caught)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("bad"); } }));
    const res = await fetchKapnos(args);
    expect(res).toBeNull();
  });
});
