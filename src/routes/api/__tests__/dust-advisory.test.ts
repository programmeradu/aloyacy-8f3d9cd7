import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/dust-advisory";
import { getHandler } from "./handler";

const GET = getHandler(Route, "GET");
vi.mock("@/lib/pulse-live.functions", () => ({ getDustAdvisory: vi.fn(async () => null) }));

afterEach(() => vi.restoreAllMocks());

describe("GET /api/public/dust-advisory", () => {
  it("accepts valid lat/lng", async () => {
    const res = await GET({
      request: new Request("http://x/api/public/dust-advisory?lat=34.9&lng=33.6"),
    });
    expect(res.status).toBe(200);
  });

  it("rejects missing lng with issues", async () => {
    const res = await GET({ request: new Request("http://x/api/public/dust-advisory?lat=34.9") });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
    expect(j.issues[0].path).toBe("lng");
  });
});
