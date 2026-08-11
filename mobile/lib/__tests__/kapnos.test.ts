import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKapnos } from "@/lib/kapnos";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const args = { from: { lat: 34.87, lng: 33.62 }, to: { lat: 34.7, lng: 32.48 } };

describe("fetchKapnos", () => {
  it("POSTs the from/to/window args to the kapnos endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchKapnos(args);

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/kapnos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(args),
    });
  });

  it("returns the parsed suggestion on success", async () => {
    const suggestion = { routeId: "k1", routeCode: "K1", routeName: "Kapnos Airport" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(suggestion), { status: 200 })));

    await expect(fetchKapnos(args)).resolves.toEqual(suggestion);
  });

  it("returns null when the response is not ok, instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));

    await expect(fetchKapnos(args)).resolves.toBeNull();
  });

  it("returns null when fetch rejects with a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));

    await expect(fetchKapnos(args)).resolves.toBeNull();
  });

  it("returns null when the response body is not valid JSON", async () => {
    const badResponse = new Response("ok", { status: 200 });
    vi.spyOn(badResponse, "json").mockRejectedValue(new SyntaxError("Unexpected token"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(badResponse));

    // The current implementation does not catch json() parsing errors —
    // it awaits res.json() inside the try block, so this should resolve to null.
    await expect(fetchKapnos(args)).resolves.toBeNull();
  });
});
