import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-planner.functions", () => ({
  parseTripIntent: vi.fn(async (input?: { data?: unknown }) => ({ echo: input?.data })),
}));

import { Route } from "@/routes/api/public/parse-trip-intent";
import { parseTripIntent } from "@/lib/ai-planner.functions";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
function req(body: unknown) {
  return new Request("http://x/api/public/parse-trip-intent", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/parse-trip-intent", () => {
  beforeEach(() => vi.mocked(parseTripIntent).mockClear());

  it("accepts a valid request", async () => {
    const res = await POST({ request: req({ text: "bus to Larnaca airport" }) });
    expect(res.status).toBe(200);
    expect(parseTripIntent).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing text field with 400 + issues", async () => {
    const res = await POST({ request: req({}) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Array.isArray(json.details ?? json.issues)).toBe(true);
    expect(parseTripIntent).not.toHaveBeenCalled();
  });

  it("rejects text that is too short", async () => {
    const res = await POST({ request: req({ text: "a" }) });
    expect(res.status).toBe(400);
  });
});
