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

function req(headers: Record<string, string>) {
  return new Request("http://x/api/public/trip-alerts", { method: "POST", headers });
}

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

  it("rejects a wrong bearer secret", async () => {
    const res = await POST({ request: req({ authorization: "Bearer nope" }) });
    expect(res.status).toBe(401);
  });
});
