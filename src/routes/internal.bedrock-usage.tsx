import { createFileRoute, useServerFn } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getBedrockUsageStats, type BedrockUsageStats } from "@/lib/bedrock-usage.functions";

export const Route = createFileRoute("/internal/bedrock-usage")({
  head: () => ({
    meta: [
      { title: "Bedrock Usage — Internal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BedrockUsagePage,
});

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const compact = (n: number) => n.toLocaleString("en-US");

function BedrockUsagePage() {
  const fetchStats = useServerFn(getBedrockUsageStats);
  const [keyHint, setKeyHint] = useState("");
  const [days, setDays] = useState(30);
  const [cap, setCap] = useState(1000);

  const q = useQuery({
    queryKey: ["bedrock-usage", keyHint, days],
    queryFn: () => fetchStats({ data: { keyHint: keyHint.trim() || undefined, days } }),
    refetchInterval: 15_000,
  });

  const stats: BedrockUsageStats | undefined = q.data;

  const capPct = useMemo(() => {
    if (!stats || cap <= 0) return 0;
    return Math.min(100, (stats.windowTotals.estCostUsd / cap) * 100);
  }, [stats, cap]);

  const maxDayCost = useMemo(() => {
    if (!stats) return 0;
    return Math.max(0.0001, ...stats.perDay.map((d) => d.estCostUsd));
  }, [stats]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Internal · BYOK metering</div>
          <h1 className="font-display text-4xl font-bold">Bedrock usage</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every call routed through <span className="font-mono">/api/public/bedrock-test</span> is logged with model, token counts, latency, and estimated cost.
            Prices are approximate on-demand Bedrock rates — treat as a running estimate, not a bill.
          </p>
        </header>

        {/* Controls */}
        <div className="rounded-2xl border border-border bg-card p-5 grid gap-4 sm:grid-cols-4">
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Access key (last 4)</div>
            <input
              value={keyHint}
              onChange={(e) => setKeyHint(e.target.value.slice(0, 8))}
              placeholder="e.g. XKJ4"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Window (days)</div>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">Soft cap (USD, this window)</div>
            <input
              type="number"
              value={cap}
              min={1}
              onChange={(e) => setCap(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </label>
        </div>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Kpi label="Spend (window)" value={money(stats?.windowTotals.estCostUsd ?? 0)} sub={`${compact(stats?.windowTotals.calls ?? 0)} calls`} />
          <Kpi label="Tokens in / out" value={`${compact(stats?.windowTotals.inputTokens ?? 0)} / ${compact(stats?.windowTotals.outputTokens ?? 0)}`} sub="input / output" />
          <Kpi
            label="Success rate"
            value={
              stats && stats.windowTotals.calls > 0
                ? `${Math.round((stats.windowTotals.okCalls / stats.windowTotals.calls) * 100)}%`
                : "—"
            }
            sub={`${compact(stats?.windowTotals.okCalls ?? 0)} OK`}
          />
          <Kpi label="Lifetime spend" value={money(stats?.totals.estCostUsd ?? 0)} sub={`${compact(stats?.totals.calls ?? 0)} calls all-time`} />
        </div>

        {/* Cap meter */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-semibold">Soft cap · this window</div>
            <div className="text-xs font-mono text-muted-foreground">
              {money(stats?.windowTotals.estCostUsd ?? 0)} of {money(cap)} · {capPct.toFixed(1)}%
            </div>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${capPct}%`,
                background: capPct >= 100 ? "hsl(var(--destructive))" : capPct >= 80 ? "var(--ochre)" : "var(--aegean)",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This is a client-side warning only. For a hard stop, configure AWS Budgets with an action that attaches a Deny policy on the IAM user at 100%.
          </p>
        </div>

        {/* Daily chart */}
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Daily spend</h2>
            <div className="text-xs font-mono text-muted-foreground">last {days} days</div>
          </div>
          <div className="flex items-end gap-1 h-40">
            {stats?.perDay.map((d) => {
              const h = Math.max(2, Math.round((d.estCostUsd / maxDayCost) * 100));
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group" title={`${d.day} · ${money(d.estCostUsd)} · ${compact(d.calls)} calls`}>
                  <div
                    className="w-full rounded-t transition-colors"
                    style={{
                      height: `${h}%`,
                      background: d.estCostUsd > 0 ? "var(--aegean)" : "hsl(var(--muted))",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
            <span>{stats?.perDay[0]?.day}</span>
            <span>{stats?.perDay[stats.perDay.length - 1]?.day}</span>
          </div>
        </div>

        {/* Per-model table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">By model</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs font-mono uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Model</th>
                  <th className="text-right px-4 py-2 font-medium">Calls</th>
                  <th className="text-right px-4 py-2 font-medium">Input tok</th>
                  <th className="text-right px-4 py-2 font-medium">Output tok</th>
                  <th className="text-right px-4 py-2 font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {stats?.perModel.map((m) => (
                  <tr key={m.model_id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs break-all">{m.model_id}</td>
                    <td className="px-4 py-2 text-right font-mono">{compact(m.calls)}</td>
                    <td className="px-4 py-2 text-right font-mono">{compact(m.inputTokens)}</td>
                    <td className="px-4 py-2 text-right font-mono">{compact(m.outputTokens)}</td>
                    <td className="px-4 py-2 text-right font-mono font-semibold">{money(m.estCostUsd)}</td>
                  </tr>
                ))}
                {(!stats || stats.perModel.length === 0) && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">No calls in window</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-key table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">By access key</h2>
            <div className="text-xs text-muted-foreground">only last 4 chars stored</div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs font-mono uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Key hint</th>
                <th className="text-right px-4 py-2 font-medium">Calls</th>
                <th className="text-right px-4 py-2 font-medium">Est. cost</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {stats?.perKey.map((k) => (
                <tr key={String(k.access_key_hint)} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">····{k.access_key_hint ?? "unknown"}</td>
                  <td className="px-4 py-2 text-right font-mono">{compact(k.calls)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{money(k.estCostUsd)}</td>
                  <td className="px-4 py-2 text-right">
                    {k.access_key_hint && (
                      <button
                        onClick={() => setKeyHint(k.access_key_hint!)}
                        className="text-xs font-mono uppercase text-primary hover:underline"
                      >Filter</button>
                    )}
                  </td>
                </tr>
              ))}
              {(!stats || stats.perKey.length === 0) && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No calls in window</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Recent calls */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">Recent calls</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 font-mono uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">When</th>
                  <th className="text-left px-3 py-2 font-medium">Model</th>
                  <th className="text-left px-3 py-2 font-medium">Key</th>
                  <th className="text-right px-3 py-2 font-medium">In</th>
                  <th className="text-right px-3 py-2 font-medium">Out</th>
                  <th className="text-right px-3 py-2 font-medium">ms</th>
                  <th className="text-right px-3 py-2 font-medium">Cost</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recent.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono max-w-xs truncate" title={r.model_id}>{r.model_id.split(/[/.]/).pop()}</td>
                    <td className="px-3 py-2 font-mono">····{r.access_key_hint ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{compact(r.input_tokens)}</td>
                    <td className="px-3 py-2 text-right font-mono">{compact(r.output_tokens)}</td>
                    <td className="px-3 py-2 text-right font-mono">{compact(r.latency_ms)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(Number(r.est_cost_usd))}</td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 px-2 py-0.5 font-mono">OK {r.http_status}</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-destructive/15 text-destructive px-2 py-0.5 font-mono" title={r.error ?? ""}>ERR {r.http_status ?? "?"}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(!stats || stats.recent.length === 0) && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No calls yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Auto-refreshes every 15s. Costs are calculated from Bedrock Converse <span className="font-mono">usage</span> field × on-demand list price per model.
          Unknown models log 0 — add pricing in <span className="font-mono">src/lib/bedrock-pricing.ts</span>.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-display font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
