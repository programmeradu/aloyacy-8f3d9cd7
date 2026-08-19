import { describe, expect, it, vi, beforeEach } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult, type QueryCall } from "./supabase-mock";

// bedrock_usage is queried twice (lifetime narrow projection, then windowed "*").
// Distinguish which logical query is resolving by inspecting the most recent
// `select` call recorded for the table.
const state: {
  lifetimePages: TableResult[];
  windowPages: TableResult[];
} = { lifetimePages: [], windowPages: [] };

let lifetimeCursor = 0;
let windowCursor = 0;

function resolveBedrockUsage(calls: QueryCall[]): TableResult {
  const mine = calls.filter((c) => c.table === "bedrock_usage");
  const lastSelect = [...mine].reverse().find((c) => c.method === "select");
  const isLifetime = lastSelect?.args[0] === "input_tokens,output_tokens,est_cost_usd,ok";
  if (isLifetime) {
    const page = state.lifetimePages[lifetimeCursor] ?? { data: [], error: null };
    lifetimeCursor++;
    return page;
  }
  const page = state.windowPages[windowCursor] ?? { data: [], error: null };
  windowCursor++;
  return page;
}

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({ bedrock_usage: resolveBedrockUsage });
  return { supabaseAdmin: client };
});

const { getBedrockUsageStats } = await import("../bedrock-usage.functions");

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "1",
    created_at: new Date().toISOString(),
    access_key_hint: "key-a",
    auth_mode: "sigv4",
    region: "us-east-1",
    model_id: "anthropic.claude-3-haiku-20240307-v1:0",
    input_tokens: 100,
    output_tokens: 50,
    est_cost_usd: 0.01,
    latency_ms: 200,
    http_status: 200,
    ok: true,
    error: null,
    ...overrides,
  };
}

describe("getBedrockUsageStats", () => {
  beforeEach(() => {
    lifetimeCursor = 0;
    windowCursor = 0;
    state.lifetimePages = [{ data: [], error: null }];
    state.windowPages = [{ data: [], error: null }];
  });

  it("returns zeroed stats when there is no usage", async () => {
    const out = await callServerFn(getBedrockUsageStats, undefined);
    expect(out.totals.calls).toBe(0);
    expect(out.perDay).toHaveLength(30); // default days window, gap-filled
    expect(out.recent).toEqual([]);
  });

  it("aggregates lifetime totals, per-day/per-model/per-key rollups from windowed rows", async () => {
    state.lifetimePages = [
      { data: [{ input_tokens: 100, output_tokens: 50, est_cost_usd: 0.01, ok: true }], error: null },
    ];
    state.windowPages = [
      {
        data: [
          row({ model_id: "m1", access_key_hint: "k1", input_tokens: 10, output_tokens: 5, est_cost_usd: 0.001, ok: true }),
          row({ model_id: "m2", access_key_hint: "k2", input_tokens: 20, output_tokens: 8, est_cost_usd: 0.002, ok: false }),
        ],
        error: null,
      },
    ];

    const out = await callServerFn(getBedrockUsageStats, { days: 3 });
    expect(out.totals.calls).toBe(1);
    expect(out.windowTotals.calls).toBe(2);
    expect(out.windowTotals.okCalls).toBe(1);
    expect(out.perModel.map((m) => m.model_id).sort()).toEqual(["m1", "m2"]);
    expect(out.perKey.map((k) => k.access_key_hint).sort()).toEqual(["k1", "k2"]);
    expect(out.recent).toHaveLength(2);
    expect(out.perDay).toHaveLength(3);
  });

  it("paginates lifetime rows across multiple pages of PAGE size", async () => {
    const fullPage = Array.from({ length: 1000 }, () =>
      ({ input_tokens: 1, output_tokens: 1, est_cost_usd: 0.0001, ok: true }),
    );
    state.lifetimePages = [
      { data: fullPage, error: null },
      { data: [{ input_tokens: 1, output_tokens: 1, est_cost_usd: 0.0001, ok: true }], error: null },
    ];
    state.windowPages = [{ data: [], error: null }];

    const out = await callServerFn(getBedrockUsageStats, undefined);
    expect(out.totals.calls).toBe(1001);
  });

  it("throws when the lifetime query errors", async () => {
    state.lifetimePages = [{ data: null, error: { message: "boom" } }];
    await expect(callServerFn(getBedrockUsageStats, undefined)).rejects.toBeTruthy();
  });

  it("throws when the windowed query errors", async () => {
    state.lifetimePages = [{ data: [], error: null }];
    state.windowPages = [{ data: null, error: { message: "boom" } }];
    await expect(callServerFn(getBedrockUsageStats, undefined)).rejects.toBeTruthy();
  });

  it("clamps days and cap to their valid ranges without throwing", async () => {
    state.lifetimePages = [{ data: [], error: null }];
    state.windowPages = [{ data: [], error: null }];
    const out = await callServerFn(getBedrockUsageStats, { days: 10000, cap: 1 });
    expect(out.perDay).toHaveLength(365);
  });
});
