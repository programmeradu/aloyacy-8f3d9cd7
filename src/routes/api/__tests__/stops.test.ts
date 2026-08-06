import { describe, it, expect } from "vitest";
import { Route } from "@/routes/api/public/stops";
import { getHandler, apiRequest } from "./handler";

const GET = getHandler(Route, "GET");

describe("GET /api/public/stops", () => {
  it("returns the stops+routes bundle (no input surface to validate)", async () => {
    const res = await GET({ request: apiRequest("/api/public/stops") });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("stops");
    expect(json).toHaveProperty("routes");
  });
});
