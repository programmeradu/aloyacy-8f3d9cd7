import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/plan";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/multileg.functions", () => ({
  planMultiLeg: vi.fn(async () => ({ itineraries: [] })),
}));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/plan", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/public/plan", () => {
  it("accepts a valid from/to", async () => {
    const res = await POST({
      request: body({ from: { lat: 34.9, lng: 33.6 }, to: { lat: 34.95, lng: 33.65 } }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid mode with issues", async () => {
    const res = await POST({
      request: body({
        from: { lat: 34.9, lng: 33.6 },
        to: { lat: 34.95, lng: 33.65 },
        mode: "warp-speed",
      }),
    });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues.some((i: { path: string }) => i.path === "mode")).toBe(true);
  });
});
