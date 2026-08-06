import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/intercity-intel";
import { getHandler } from "./handler";

const GET = getHandler(Route, "GET");
vi.mock("@/lib/intercity-intel.functions", () => ({
  getIntercityInsights: vi.fn(async () => ({ routeId: "r1", tier: "unknown" })),
}));

afterEach(() => vi.restoreAllMocks());

describe("GET /api/public/intercity-intel", () => {
  it("accepts a valid routeId", async () => {
    const res = await GET({
      request: new Request("http://x/api/public/intercity-intel?routeId=r1"),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a missing routeId with issues", async () => {
    const res = await GET({ request: new Request("http://x/api/public/intercity-intel") });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues[0].path).toBe("routeId");
  });
});
