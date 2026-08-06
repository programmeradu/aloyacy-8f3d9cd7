import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/airport";
import { getHandler } from "./handler";

const GET = getHandler(Route, "GET");
vi.mock("@/lib/airport.functions", () => ({
  getAirportPage: vi.fn(async () => ({ airport: { code: "lca" } })),
}));

afterEach(() => vi.restoreAllMocks());

describe("GET /api/public/airport", () => {
  it("accepts a valid code", async () => {
    const res = await GET({ request: new Request("http://x/api/public/airport?code=LCA") });
    expect(res.status).toBe(200);
  });

  it("rejects a missing/invalid code with issues", async () => {
    const res = await GET({ request: new Request("http://x/api/public/airport?code=xyz") });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
    expect(body.issues[0].path).toBe("code");
  });
});
