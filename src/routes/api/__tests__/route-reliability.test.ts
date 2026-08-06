import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/reliability.functions", () => ({
  getRouteReliability: vi.fn(async () => []),
}));

import { Route } from "@/routes/api/public/route-reliability";
import { getRouteReliability } from "@/lib/reliability.functions";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
function req(body: unknown) {
  return new Request("http://x/api/public/route-reliability", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/route-reliability", () => {
  it("accepts a valid routeIds array", async () => {
    const res = await POST({ request: req({ routeIds: ["1", "2"] }) });
    expect(res.status).toBe(200);
    expect(getRouteReliability).toHaveBeenCalledWith({ data: { routeIds: ["1", "2"] } });
  });

  it("rejects an empty routeIds array", async () => {
    const res = await POST({ request: req({ routeIds: [] }) });
    expect(res.status).toBe(400);
  });

  it("rejects more than 50 routeIds", async () => {
    const routeIds = Array.from({ length: 51 }, (_, i) => String(i));
    const res = await POST({ request: req({ routeIds }) });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const res = await POST({
      request: new Request("http://x", { method: "POST", body: "{not json" }),
    });
    expect(res.status).toBe(400);
  });
});
