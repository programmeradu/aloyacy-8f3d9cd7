import { describe, it, expect, vi, afterEach } from "vitest";
import { Route } from "@/routes/api/public/park-and-ride";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
vi.mock("@/lib/park-and-ride.functions", () => ({
  suggestParkAndRide: vi.fn(async () => null),
}));

afterEach(() => vi.restoreAllMocks());

const body = (b: unknown) =>
  new Request("http://x/api/public/park-and-ride", { method: "POST", body: JSON.stringify(b) });

describe("POST /api/public/park-and-ride", () => {
  it("accepts a valid body", async () => {
    const res = await POST({
      request: body({ from: { lat: 34.9, lng: 33.6 }, to: { lat: 34.95, lng: 33.65 } }),
    });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid busOnlyAccessWalkM with issues", async () => {
    const res = await POST({
      request: body({
        from: { lat: 34.9, lng: 33.6 },
        to: { lat: 34.95, lng: 33.65 },
        busOnlyAccessWalkM: -5,
      }),
    });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toBe("invalid_request");
  });
});
