import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/today.functions", () => ({
  getTodayBriefing: vi.fn(async () => ({ briefing: true })),
}));
vi.mock("@/lib/pulse.functions", () => ({
  getLivePulse: vi.fn(async () => ({ live: true })),
  getPulseHourStrip: vi.fn(async () => ({ hourly: true })),
}));
vi.mock("@/lib/pulse-live.functions", () => ({
  getPulseLive: vi.fn(async () => ({ signals: true })),
}));

import { Route } from "@/routes/api/public/pulse";
import { getHandler } from "./handler";

const GET = getHandler(Route, "GET");
function req(qs: string) {
  return new Request(`http://x/api/public/pulse${qs}`);
}

describe("GET /api/public/pulse", () => {
  it("accepts no params (all optional)", async () => {
    const res = await GET({ request: req("") });
    expect(res.status).toBe(200);
  });

  it("accepts valid Cyprus coordinates", async () => {
    const res = await GET({ request: req("?lat=34.68&lng=33.04") });
    expect(res.status).toBe(200);
  });

  it("rejects out-of-bounds coordinates with 400", async () => {
    const res = await GET({ request: req("?lat=51.5&lng=-0.12") });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("rejects non-numeric lat", async () => {
    const res = await GET({ request: req("?lat=abc&lng=33.04") });
    expect(res.status).toBe(400);
  });
});
