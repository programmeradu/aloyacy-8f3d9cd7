import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getBedrockUsageStats, type BedrockUsageStats } from "@/lib/bedrock-usage.functions";
import { getBedrockCloudwatchStats, type BedrockCwStats } from "@/lib/bedrock-cloudwatch.functions";
import { getBedrockCostExplorer, type BedrockCeStats } from "@/lib/bedrock-cost-explorer.functions";

export const Route = createFileRoute("/internal/bedrock-usage")({
  head: () => ({
    meta: [{ title: "Bedrock Usage — Internal" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: BedrockUsagePage,
});

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
const money2 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const compact = (n: number) => n.toLocaleString("en-US");

function formatWindow(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 24) return `${hours}h`;
  return `${hours / 24}d`;
}
function formatPeriod(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  return `${s / 3600}h`;
}
function formatAxisTs(iso: string, hours: number): string {
  const d = new Date(iso);
  if (hours <= 24) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

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
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Internal · BYOK metering
          </div>
          <h1 className="font-display text-4xl font-bold">Bedrock usage</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Every call routed through <span className="font-mono">/api/public/bedrock-test</span> is
            logged with model, token counts, latency, and estimated cost. Prices are approximate
            on-demand Bedrock rates — treat as a running estimate, not a bill.
          </p>
        </header>

        {/* Controls */}
        <div className="rounded-2xl border border-border bg-card p-5 grid gap-4 sm:grid-cols-4">
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              Access key (last 4)
            </div>
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
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              Soft cap (USD, this window)
            </div>
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
          <Kpi
            label="Spend (window)"
            value={money(stats?.windowTotals.estCostUsd ?? 0)}
            sub={`${compact(stats?.windowTotals.calls ?? 0)} calls`}
          />
          <Kpi
            label="Tokens in / out"
            value={`${compact(stats?.windowTotals.inputTokens ?? 0)} / ${compact(stats?.windowTotals.outputTokens ?? 0)}`}
            sub="input / output"
          />
          <Kpi
            label="Success rate"
            value={
              stats && stats.windowTotals.calls > 0
                ? `${Math.round((stats.windowTotals.okCalls / stats.windowTotals.calls) * 100)}%`
                : "—"
            }
            sub={`${compact(stats?.windowTotals.okCalls ?? 0)} OK`}
          />
          <Kpi
            label="Lifetime spend"
            value={money(stats?.totals.estCostUsd ?? 0)}
            sub={`${compact(stats?.totals.calls ?? 0)} calls all-time`}
          />
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
                background:
                  capPct >= 100
                    ? "hsl(var(--destructive))"
                    : capPct >= 80
                      ? "var(--ochre)"
                      : "var(--aegean)",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This is a client-side warning only. For a hard stop, configure AWS Budgets with an
            action that attaches a Deny policy on the IAM user at 100%.
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
                <div
                  key={d.day}
                  className="flex-1 flex flex-col items-center gap-1 group"
                  title={`${d.day} · ${money(d.estCostUsd)} · ${compact(d.calls)} calls`}
                >
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
                    <td className="px-4 py-2 text-right font-mono font-semibold">
                      {money(m.estCostUsd)}
                    </td>
                  </tr>
                ))}
                {(!stats || stats.perModel.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                      No calls in window
                    </td>
                  </tr>
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
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {money(k.estCostUsd)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {k.access_key_hint && (
                      <button
                        onClick={() => setKeyHint(k.access_key_hint!)}
                        className="text-xs font-mono uppercase text-primary hover:underline"
                      >
                        Filter
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(!stats || stats.perKey.length === 0) && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">
                    No calls in window
                  </td>
                </tr>
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
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono max-w-xs truncate" title={r.model_id}>
                      {r.model_id.split(/[/.]/).pop()}
                    </td>
                    <td className="px-3 py-2 font-mono">····{r.access_key_hint ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{compact(r.input_tokens)}</td>
                    <td className="px-3 py-2 text-right font-mono">{compact(r.output_tokens)}</td>
                    <td className="px-3 py-2 text-right font-mono">{compact(r.latency_ms)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {money(Number(r.est_cost_usd))}
                    </td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-700 px-2 py-0.5 font-mono">
                          OK {r.http_status}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full bg-destructive/15 text-destructive px-2 py-0.5 font-mono"
                          title={r.error ?? ""}
                        >
                          ERR {r.http_status ?? "?"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {(!stats || stats.recent.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                      No calls yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CloudWatch — account-wide, near real time */}
        <CloudwatchPanel />

        {/* Cost Explorer — real billed $, delayed ~8-24h */}
        <CostExplorerPanel />

        <p className="text-xs text-muted-foreground">
          Proxy log auto-refreshes every 15s. Costs are calculated from Bedrock Converse{" "}
          <span className="font-mono">usage</span> field × on-demand list price per model. Unknown
          models log 0 — add pricing in{" "}
          <span className="font-mono">src/lib/bedrock-pricing.ts</span>.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-display font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// Parse "AKIA...:SECRET[:region][:sessionToken]" — matches the test page format.
function parseCombined(
  raw: string,
): { accessKeyId: string; secretAccessKey: string; region?: string; sessionToken?: string } | null {
  const parts = raw
    .trim()
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const [accessKeyId, secretAccessKey, region, sessionToken] = parts;
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, region, sessionToken };
}

const CW_STORAGE = "bedrock-cw-creds";

function CloudwatchPanel() {
  const fetchCw = useServerFn(getBedrockCloudwatchStats);
  const [combined, setCombined] = useState("");
  const [region, setRegion] = useState("us-west-2");
  const [hours, setHours] = useState(24);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(CW_STORAGE);
    if (saved) {
      try {
        const j = JSON.parse(saved);
        setCombined(j.combined ?? "");
        setRegion(j.region ?? "us-west-2");
        setEnabled(Boolean(j.enabled));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const parsed = useMemo(() => parseCombined(combined), [combined]);
  const effectiveRegion = parsed?.region || region;

  const q = useQuery({
    queryKey: ["bedrock-cw", parsed?.accessKeyId, effectiveRegion, hours, enabled],
    queryFn: async () => {
      if (!parsed) throw new Error("No credentials");
      return fetchCw({
        data: {
          accessKeyId: parsed.accessKeyId,
          secretAccessKey: parsed.secretAccessKey,
          sessionToken: parsed.sessionToken,
          region: effectiveRegion,
          hours,
        },
      });
    },
    enabled: enabled && !!parsed,
    refetchInterval: enabled ? 60_000 : false,
    retry: 0,
  });

  const cw: BedrockCwStats | undefined = q.data;

  const persist = (next: { combined?: string; region?: string; enabled?: boolean }) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      CW_STORAGE,
      JSON.stringify({
        combined: next.combined ?? combined,
        region: next.region ?? region,
        enabled: next.enabled ?? enabled,
      }),
    );
  };

  const maxTs = useMemo(
    () => Math.max(0.0001, ...(cw?.perMinute.map((p) => p.invocations) ?? [0.0001])),
    [cw],
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">AWS-wide · CloudWatch</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Near real-time (~1-2 min lag). Captures every Bedrock call in the account, from any app
            or key — not just calls through our proxy. Split by{" "}
            <span className="font-mono">ModelId</span>; per-key split needs CloudTrail.
          </p>
        </div>
        {cw?.latestDatapointAt && (
          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            latest datapoint {new Date(cw.latestDatapointAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              AWS creds · <span className="font-mono">AKIA…:SECRET[:region][:sessionToken]</span>
            </div>
            <textarea
              value={combined}
              onChange={(e) => {
                setCombined(e.target.value);
                persist({ combined: e.target.value });
              }}
              placeholder="AKIA...:SECRET:us-west-2"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono resize-none"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Region</div>
            <input
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                persist({ region: e.target.value });
              }}
              placeholder="us-west-2"
              className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Window</div>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <optgroup label="Minutes">
                <option value={5 / 60}>5 min</option>
                <option value={15 / 60}>15 min</option>
                <option value={30 / 60}>30 min</option>
              </optgroup>
              <optgroup label="Hours">
                {[1, 3, 6, 12, 24].map((h) => (
                  <option key={h} value={h}>
                    {h}h
                  </option>
                ))}
              </optgroup>
              <optgroup label="Days">
                {[72, 168, 336].map((h) => (
                  <option key={h} value={h}>
                    {h / 24}d
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!parsed}
              onClick={() => {
                const nx = !enabled;
                setEnabled(nx);
                persist({ enabled: nx });
              }}
              className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enabled ? "Live · pause" : "Start live"}
            </button>
          </div>
        </div>

        {parsed && (
          <div className="text-[10px] font-mono text-muted-foreground">
            key ····{parsed.accessKeyId.slice(-4)} · secret {parsed.secretAccessKey.length} chars ·
            region {effectiveRegion}
            {parsed.sessionToken ? " · session token attached" : ""}
          </div>
        )}
        {!parsed && combined.length > 0 && (
          <div className="text-xs text-destructive font-mono">
            Could not parse — expected AKIA…:SECRET[:region][:sessionToken]
          </div>
        )}
        {q.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-xs font-mono">
            {(q.error as Error).message}
          </div>
        )}

        {cw && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Kpi
                label="Spend (est)"
                value={money(cw.totals.estCostUsd)}
                sub={`${compact(cw.totals.invocations)} invocations`}
              />
              <Kpi
                label="Input tokens"
                value={compact(cw.totals.inputTokens)}
                sub={`${cw.windowHours}h window`}
              />
              <Kpi
                label="Output tokens"
                value={compact(cw.totals.outputTokens)}
                sub={`${cw.windowHours}h window`}
              />
              <Kpi
                label="Models seen"
                value={compact(cw.perModel.length)}
                sub={q.isFetching ? "refreshing…" : "auto-refresh 60s"}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-mono uppercase text-muted-foreground">
                  Invocations · {formatWindow(cw.windowHours)}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  bucket {formatPeriod(cw.periodSeconds)} · {cw.perMinute.length} points
                </div>
              </div>
              <div className="flex items-end gap-[2px] h-24 border-b border-border pb-1">
                {cw.perMinute.map((p) => (
                  <div
                    key={p.t}
                    title={`${new Date(p.t).toLocaleString()} · ${compact(p.invocations)} calls · ${money(p.estCostUsd)}`}
                    className="flex-1 min-w-[2px] rounded-t bg-[color:var(--aegean)]/80"
                    style={{ height: `${Math.max(2, (p.invocations / maxTs) * 100)}%` }}
                  />
                ))}
                {cw.perMinute.length === 0 && (
                  <div className="w-full text-center text-xs text-muted-foreground">
                    No datapoints in window
                  </div>
                )}
              </div>
              {cw.perMinute.length > 1 && (
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>{formatAxisTs(cw.perMinute[0].t, cw.windowHours)}</span>
                  <span>
                    {formatAxisTs(
                      cw.perMinute[Math.floor(cw.perMinute.length / 2)].t,
                      cw.windowHours,
                    )}
                  </span>
                  <span>
                    {formatAxisTs(cw.perMinute[cw.perMinute.length - 1].t, cw.windowHours)}
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs font-mono uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Model</th>
                    <th className="text-right px-4 py-2 font-medium">Invocations</th>
                    <th className="text-right px-4 py-2 font-medium">Input tok</th>
                    <th className="text-right px-4 py-2 font-medium">Output tok</th>
                    <th className="text-right px-4 py-2 font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {cw.perModel.map((m) => (
                    <tr key={m.modelId} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs break-all">{m.modelId}</td>
                      <td className="px-4 py-2 text-right font-mono">{compact(m.invocations)}</td>
                      <td className="px-4 py-2 text-right font-mono">{compact(m.inputTokens)}</td>
                      <td className="px-4 py-2 text-right font-mono">{compact(m.outputTokens)}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">
                        {money(m.estCostUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!cw && !q.isFetching && !q.error && (
          <div className="text-xs text-muted-foreground">
            Paste an AWS access key with <span className="font-mono">cloudwatch:GetMetricData</span>{" "}
            permission and hit <em>Start live</em>. Creds live in{" "}
            <span className="font-mono">sessionStorage</span> for this tab only — never sent
            anywhere except AWS.
          </div>
        )}
      </div>
    </div>
  );
}

const CE_STORAGE = "bedrock-ce-creds";

function CostExplorerPanel() {
  const fetchCe = useServerFn(getBedrockCostExplorer);
  const [combined, setCombined] = useState("");
  const [days, setDays] = useState(14);
  const [granularity, setGranularity] = useState<"HOURLY" | "DAILY">("DAILY");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(CE_STORAGE);
    if (saved) {
      try {
        const j = JSON.parse(saved);
        setCombined(j.combined ?? "");
        setDays(j.days ?? 14);
        setGranularity(j.granularity ?? "DAILY");
        setEnabled(Boolean(j.enabled));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const parsed = useMemo(() => parseCombined(combined), [combined]);
  // HOURLY is only allowed for the last 14 days
  const effectiveGranularity = days > 14 ? "DAILY" : granularity;

  const q = useQuery({
    queryKey: ["bedrock-ce", parsed?.accessKeyId, days, effectiveGranularity, enabled],
    queryFn: async () => {
      if (!parsed) throw new Error("No credentials");
      return fetchCe({
        data: {
          accessKeyId: parsed.accessKeyId,
          secretAccessKey: parsed.secretAccessKey,
          sessionToken: parsed.sessionToken,
          days,
          granularity: effectiveGranularity,
        },
      });
    },
    enabled: enabled && !!parsed,
    // CE calls cost ~$0.01 each — cache for 1h; refetch on demand only
    staleTime: 60 * 60_000,
    refetchInterval: false,
    retry: 0,
  });

  const ce: BedrockCeStats | undefined = q.data;

  const persist = (
    next: Partial<{
      combined: string;
      days: number;
      granularity: "HOURLY" | "DAILY";
      enabled: boolean;
    }>,
  ) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      CE_STORAGE,
      JSON.stringify({
        combined: next.combined ?? combined,
        days: next.days ?? days,
        granularity: next.granularity ?? granularity,
        enabled: next.enabled ?? enabled,
      }),
    );
  };

  const maxBucket = useMemo(
    () => Math.max(0.0001, ...(ce?.perBucket.map((p) => p.total) ?? [0.0001])),
    [ce],
  );

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">AWS-wide · Cost Explorer</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Real billed spend for <span className="font-mono">Amazon Bedrock</span> — matches your
            invoice. Delayed ~8-24h vs CloudWatch. Each refresh costs ~$0.01 in CE fees, so cached
            for 1h.
          </p>
        </div>
        {ce?.fetchedAt && (
          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
            fetched {new Date(ce.fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              AWS creds · needs <span className="font-mono">ce:GetCostAndUsage</span>
            </div>
            <textarea
              value={combined}
              onChange={(e) => {
                setCombined(e.target.value);
                persist({ combined: e.target.value });
              }}
              placeholder="AKIA...:SECRET (reuses the CloudWatch key if it has ce:GetCostAndUsage)"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono resize-none"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Window</div>
            <select
              value={days}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDays(v);
                persist({ days: v });
              }}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Granularity</div>
            <select
              value={effectiveGranularity}
              disabled={days > 14}
              onChange={(e) => {
                const v = e.target.value as "HOURLY" | "DAILY";
                setGranularity(v);
                persist({ granularity: v });
              }}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              <option value="HOURLY">Hourly</option>
              <option value="DAILY">Daily</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!parsed || q.isFetching}
              onClick={() => {
                if (!enabled) {
                  setEnabled(true);
                  persist({ enabled: true });
                }
                q.refetch();
              }}
              className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {q.isFetching ? "Loading…" : ce ? "Refresh" : "Fetch"}
            </button>
          </div>
        </div>

        {days > 14 && (
          <div className="text-[10px] font-mono text-muted-foreground">
            Hourly granularity is limited by AWS to the last 14 days — showing daily instead.
          </div>
        )}
        {q.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-xs font-mono">
            {(q.error as Error).message}
          </div>
        )}

        {ce && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Kpi label="Today" value={money2(ce.totals.todaySpend)} sub="billed today" />
              <Kpi label="Yesterday" value={money2(ce.totals.yesterdaySpend)} sub="final" />
              <Kpi
                label="Month to date"
                value={money2(ce.totals.mtdSpend)}
                sub="this calendar month"
              />
              <Kpi
                label="Window total"
                value={money2(ce.totals.windowSpend)}
                sub={`${days}d · ${ce.granularity.toLowerCase()}`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-mono uppercase text-muted-foreground">
                  Spend · {days}d · {ce.granularity.toLowerCase()}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {ce.perBucket.length} buckets
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-32 border-b border-border pb-1">
                {ce.perBucket.map((p) => (
                  <div
                    key={p.start}
                    title={`${new Date(p.start).toLocaleString()} · ${money2(p.total)}`}
                    className="flex-1 min-w-[3px] rounded-t bg-[color:var(--ochre)]/80"
                    style={{ height: `${Math.max(2, (p.total / maxBucket) * 100)}%` }}
                  />
                ))}
                {ce.perBucket.length === 0 && (
                  <div className="w-full text-center text-xs text-muted-foreground">
                    No spend in window
                  </div>
                )}
              </div>
              {ce.perBucket.length > 1 && (
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>
                    {formatAxisTs(ce.perBucket[0].start, ce.granularity === "HOURLY" ? 24 : 999)}
                  </span>
                  <span>
                    {formatAxisTs(
                      ce.perBucket[Math.floor(ce.perBucket.length / 2)].start,
                      ce.granularity === "HOURLY" ? 24 : 999,
                    )}
                  </span>
                  <span>
                    {formatAxisTs(
                      ce.perBucket[ce.perBucket.length - 1].start,
                      ce.granularity === "HOURLY" ? 24 : 999,
                    )}
                  </span>
                </div>
              )}
            </div>

            {ce.perModel.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs font-mono uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Usage type</th>
                      <th className="text-right px-4 py-2 font-medium">Billed cost</th>
                      <th className="text-right px-4 py-2 font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ce.perModel.map((m) => {
                      const share =
                        ce.totals.windowSpend > 0 ? (m.amount / ce.totals.windowSpend) * 100 : 0;
                      return (
                        <tr key={m.key} className="border-t border-border">
                          <td className="px-4 py-2 font-mono text-xs">{m.key}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold">
                            {money2(m.amount)}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                            {share.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!ce && !q.isFetching && !q.error && (
          <div className="text-xs text-muted-foreground">
            Paste an AWS access key with <span className="font-mono">ce:GetCostAndUsage</span> and
            hit <em>Fetch</em>. Cost Explorer must be enabled once in the AWS Billing console
            (one-click, free).
          </div>
        )}
      </div>
    </div>
  );
}
