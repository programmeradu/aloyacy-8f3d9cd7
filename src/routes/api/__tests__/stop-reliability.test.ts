import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/reliability.functions", () => ({
  getStopReliability: vi.fn(async () => []),
  aggregateStopReliability: vi.fn(() => ({ stopId: "s1", tier: "unknown" })),
}));

import { Route } from "@/routes/api/public/stop-reliability";
import { getStopReliability } from "@/lib/reliability.functions";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
function req(body: unknown) {
  return new Request("http://x/api/public/stop-reliability", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/stop-reliability", () => {
  it("accepts a valid body", async () => {
    const res = await POST({ request: req({ stopId: "s1", routeIds: ["1"] }) });
    expect(res.status).toBe(200);
    expect(getStopReliability).toHaveBeenCalled();
  });

  it("rejects a missing stopId", async () => {
    const res = await POST({ request: req({ routeIds: ["1"] }) });
    expect(res.status).toBe(400);
  });

  it("rejects an empty routeIds array", async () => {
    const res = await POST({ request: req({ stopId: "s1", routeIds: [] }) });
    expect(res.status).toBe(400);
  });
});
