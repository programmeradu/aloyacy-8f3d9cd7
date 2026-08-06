import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/gtfs-headsigns";
import { getHandler } from "./handler";

const GET = getHandler(Route, "GET");
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/public/gtfs-headsigns", () => {
  it("proxies the static JSON file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ "1": "City Centre" }), { status: 200 })),
    );
    const res = await GET({ request: new Request("http://x/api/public/gtfs-headsigns") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ "1": "City Centre" });
  });

  it("returns an empty object when the upstream fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const res = await GET({ request: new Request("http://x/api/public/gtfs-headsigns") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });
});
