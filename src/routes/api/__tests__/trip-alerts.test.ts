import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
    from: (table: string) => {
      if (table === "active_trips") {
        return {
          select: () => ({ or: async () => ({ data: [], error: null }) }),
        };
      }
      return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
    },
  },
}));

import { Route } from "@/routes/api/public/trip-alerts";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
});
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
});

function req(headers: Record<string, string>, body?: string) {
  return new Request("http://x/api/public/trip-alerts", { method: "POST", headers, body });
}

const AUTH = { authorization: "Bearer test-cron-secret" };

describe("POST /api/public/trip-alerts", () => {
  it("processes the tick for a valid cron bearer secret", async () => {
    const res = await POST({ request: req({ authorization: "Bearer test-cron-secret" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("processed");
  });

  it("rejects a request with no auth", async () => {
    const res = await POST({ request: req({}) });
    expect(res.status).toBe(401);
  });

  it("accepts an explicit batch limit in the body", async () => {
    const res = await POST({
      request: req({ ...AUTH, "content-type": "application/json" }, JSON.stringify({ limit: 25 })),
    });
    expect(res.status).toBe(200);
  });

  it("rejects a body that is not valid JSON", async () => {
    const res = await POST({
      request: req({ ...AUTH, "content-type": "application/json" }, "{not json"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "body is not valid JSON" });
  });

  it("rejects an out-of-range limit", async () => {
    const res = await POST({
      request: req({ ...AUTH, "content-type": "application/json" }, JSON.stringify({ limit: -3 })),
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown body keys instead of silently ignoring them", async () => {
    const res = await POST({
      request: req({ ...AUTH, "content-type": "application/json" }, JSON.stringify({ nope: 1 })),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a wrong bearer secret", async () => {
    const res = await POST({ request: req({ authorization: "Bearer nope" }) });
    expect(res.status).toBe(401);
  });
});
