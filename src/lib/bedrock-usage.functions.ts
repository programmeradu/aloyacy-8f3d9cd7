import { createServerFn } from "@tanstack/react-start";

export type BedrockUsageRow = {
  id: string;
  created_at: string;
  access_key_hint: string | null;
  auth_mode: string;
  region: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  est_cost_usd: number;
  latency_ms: number;
  http_status: number | null;
  ok: boolean;
  error: string | null;
};

export type BedrockUsageStats = {
  totals: {
    calls: number;
    okCalls: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
  };
  windowTotals: {
    calls: number;
    okCalls: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number;
  };
  perDay: Array<{ day: string; calls: number; estCostUsd: number; tokens: number }>;
  perModel: Array<{ model_id: string; calls: number; estCostUsd: number; inputTokens: number; outputTokens: number }>;
  perKey: Array<{ access_key_hint: string | null; calls: number; estCostUsd: number }>;
  recent: BedrockUsageRow[];
};

export const getBedrockUsageStats = createServerFn({ method: "GET" })
  .inputValidator((input: { keyHint?: string; days?: number; cap?: number } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.min(Math.max(data?.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    // Lifetime totals (small aggregate — cap rows by not selecting body)
    const lifetimeQuery = supabaseAdmin
      .from("bedrock_usage")
      .select("input_tokens,output_tokens,est_cost_usd,ok", { count: "exact" });
    if (data?.keyHint) lifetimeQuery.eq("access_key_hint", data.keyHint);
    const lifetime = await lifetimeQuery;

    let lifeCalls = 0, lifeOk = 0, lifeIn = 0, lifeOut = 0, lifeCost = 0;
    for (const r of lifetime.data ?? []) {
      lifeCalls++;
      if (r.ok) lifeOk++;
      lifeIn += r.input_tokens ?? 0;
      lifeOut += r.output_tokens ?? 0;
      lifeCost += Number(r.est_cost_usd ?? 0);
    }

    const windowQuery = supabaseAdmin
      .from("bedrock_usage")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data?.keyHint) windowQuery.eq("access_key_hint", data.keyHint);
    const rows = ((await windowQuery).data ?? []) as BedrockUsageRow[];

    let wCalls = 0, wOk = 0, wIn = 0, wOut = 0, wCost = 0;
    const dayMap = new Map<string, { calls: number; estCostUsd: number; tokens: number }>();
    const modelMap = new Map<string, { calls: number; estCostUsd: number; inputTokens: number; outputTokens: number }>();
    const keyMap = new Map<string | null, { calls: number; estCostUsd: number }>();

    for (const r of rows) {
      wCalls++;
      if (r.ok) wOk++;
      wIn += r.input_tokens;
      wOut += r.output_tokens;
      const cost = Number(r.est_cost_usd);
      wCost += cost;

      const day = r.created_at.slice(0, 10);
      const d = dayMap.get(day) ?? { calls: 0, estCostUsd: 0, tokens: 0 };
      d.calls++;
      d.estCostUsd += cost;
      d.tokens += r.input_tokens + r.output_tokens;
      dayMap.set(day, d);

      const m = modelMap.get(r.model_id) ?? { calls: 0, estCostUsd: 0, inputTokens: 0, outputTokens: 0 };
      m.calls++;
      m.estCostUsd += cost;
      m.inputTokens += r.input_tokens;
      m.outputTokens += r.output_tokens;
      modelMap.set(r.model_id, m);

      const k = keyMap.get(r.access_key_hint) ?? { calls: 0, estCostUsd: 0 };
      k.calls++;
      k.estCostUsd += cost;
      keyMap.set(r.access_key_hint, k);
    }

    // Fill missing days for continuous chart
    const perDay: Array<{ day: string; calls: number; estCostUsd: number; tokens: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      const entry = dayMap.get(d) ?? { calls: 0, estCostUsd: 0, tokens: 0 };
      perDay.push({ day: d, ...entry });
    }

    return {
      totals: {
        calls: lifeCalls,
        okCalls: lifeOk,
        inputTokens: lifeIn,
        outputTokens: lifeOut,
        estCostUsd: lifeCost,
      },
      windowTotals: {
        calls: wCalls,
        okCalls: wOk,
        inputTokens: wIn,
        outputTokens: wOut,
        estCostUsd: wCost,
      },
      perDay,
      perModel: Array.from(modelMap.entries())
        .map(([model_id, v]) => ({ model_id, ...v }))
        .sort((a, b) => b.estCostUsd - a.estCostUsd),
      perKey: Array.from(keyMap.entries())
        .map(([access_key_hint, v]) => ({ access_key_hint, ...v }))
        .sort((a, b) => b.estCostUsd - a.estCostUsd),
      recent: rows.slice(0, 50),
    } satisfies BedrockUsageStats;
  });
