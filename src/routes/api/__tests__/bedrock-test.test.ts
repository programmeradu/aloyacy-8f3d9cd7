import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/aws-sigv4.server", () => ({
  signRequest: vi.fn(async () => ({ headers: { Authorization: "AWS4-HMAC" } })),
}));
vi.mock("@/lib/bedrock-pricing", () => ({
  estimateCost: vi.fn(() => 0.001),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

import { Route } from "@/routes/api/public/bedrock-test";
import { getHandler } from "./handler";

const POST = getHandler(Route, "POST");
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ output: "ok", usage: { inputTokens: 1, outputTokens: 1 } }), {
          status: 200,
        }),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

function req(body: unknown) {
  return new Request("http://x/api/public/bedrock-test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/bedrock-test", () => {
  it("accepts a valid api-key request", async () => {
    const res = await POST({
      request: req({ apiKey: "ABSK123", modelId: "amazon.titan", prompt: "hello" }),
    });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing modelId", async () => {
    const res = await POST({ request: req({ apiKey: "x", prompt: "hello" }) });
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing prompt", async () => {
    const res = await POST({ request: req({ apiKey: "x", modelId: "amazon.titan" }) });
    expect(res.status).toBe(400);
  });
});
