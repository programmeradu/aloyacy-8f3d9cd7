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
  vi.stubEnv("ADMIN_SECRET", ADMIN);
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ADMIN = "test-admin-secret";

function req(body: unknown, headers: Record<string, string> = { "x-aloya-admin": ADMIN }) {
  return new Request("http://x/api/public/bedrock-test", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/public/bedrock-test", () => {
  it("is a 404 without the admin credential and never calls Bedrock", async () => {
    const res = await POST({
      request: req({ apiKey: "ABSK123", modelId: "amazon.titan", prompt: "hello" }, {}),
    });
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when no admin credential is configured", async () => {
    vi.stubEnv("ADMIN_SECRET", "");
    vi.stubEnv("ADMIN_EMAILS", "");
    const res = await POST({
      request: req({ apiKey: "ABSK123", modelId: "amazon.titan", prompt: "hello" }),
    });
    expect(res.status).toBe(404);
  });

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
