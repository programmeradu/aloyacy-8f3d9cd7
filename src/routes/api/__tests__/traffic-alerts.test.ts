import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/traffic-alerts.functions", () => ({
  getItineraryTrafficAlerts: vi.fn(async () => null),
}));

import { Route } from "@/routes/api/public/traffic-alerts";
import { getItineraryTrafficAlerts } from "@/lib/traffic-alerts.functions";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
function req(body: unknown) {
  return new Request("http://x/api/public/traffic-alerts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/traffic-alerts", () => {
  it("accepts valid points", async () => {
    const res = await POST({ request: req({ points: [{ lat: 34.68, lng: 33.04 }] }) });
    expect(res.status).toBe(200);
    expect(getItineraryTrafficAlerts).toHaveBeenCalled();
  });

  it("rejects an empty points array", async () => {
    const res = await POST({ request: req({ points: [] }) });
    expect(res.status).toBe(400);
  });

  it("rejects a missing points field", async () => {
    const res = await POST({ request: req({}) });
    expect(res.status).toBe(400);
  });
});
