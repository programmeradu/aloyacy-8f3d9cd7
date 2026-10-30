import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  capPercent,
  capTone,
  compact,
  money,
  shortModelName,
  successRateLabel,
} from "@aloya/core/bedrock-metering";
import { getBedrockUsageStats, type BedrockUsageStats } from "@/lib/bedrock-usage.functions";
import { Kpi } from "./Kpi";
import { BarSeries } from "./BarSeries";

const TONE_COLOR: Record<string, string> = {
  ok: "var(--aegean)",
  warn: "var(--ochre)",
  over: "hsl(var(--destructive))",
};

/** Proxy-level metering: everything routed through /api/public/bedrock-test. */
export function ProxyUsagePanel() {
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
  const spend = stats?.windowTotals.estCostUsd ?? 0;
  const pct = capPercent(spend, cap);

  return (
    <>
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

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi
          label="Spend (window)"
          value={money(spend)}
          sub={`${compact(stats?.windowTotals.calls ?? 0)} calls`}
        />
        <Kpi
          label="Tokens in / out"
          value={`${compact(stats?.windowTotals.inputTokens ?? 0)} / ${compact(
            stats?.windowTotals.outputTokens ?? 0,
          )}`}
          sub="input / output"
        />
        <Kpi
          label="Success rate"
          value={successRateLabel(stats?.windowTotals.okCalls ?? 0, stats?.windowTotals.calls ?? 0)}
          sub={`${compact(stats?.windowTotals.okCalls ?? 0)} OK`}
        />
        <Kpi
          label="Lifetime spend"
          value={money(stats?.totals.estCostUsd ?? 0)}
          sub={`${compact(stats?.totals.calls ?? 0)} calls all-time`}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">Soft cap · this window</div>
          <div className="text-xs font-mono text-muted-foreground">
            {money(spend)} of {money(cap)} · {pct.toFixed(1)}%
          </div>
        </div>
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full transition-all"
            style={{ width: `${pct}%`, background: TONE_COLOR[capTone(pct)] }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          This is a client-side warning only. For a hard stop, configure AWS Budgets with an action
          that attaches a Deny policy on the IAM user at 100%.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Daily spend</h2>
          <div className="text-xs font-mono text-muted-foreground">last {days} days</div>
        </div>
        <BarSeries
          heightClass="h-40"
          gapClass="gap-1"
          color="var(--aegean)"
          emptyLabel="No spend in window"
          points={(stats?.perDay ?? []).map((d) => ({
            key: d.day,
            value: d.estCostUsd,
            title: `${d.day} · ${money(d.estCostUsd)} · ${compact(d.calls)} calls`,
          }))}
        />
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
          <span>{stats?.perDay[0]?.day}</span>
          <span>{stats?.perDay[stats.perDay.length - 1]?.day}</span>
        </div>
      </div>

      <TableCard title="By model">
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
            {(!stats || stats.perModel.length === 0) && <EmptyRow cols={5} />}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="By access key" note="only last 4 chars stored">
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
            {(!stats || stats.perKey.length === 0) && <EmptyRow cols={4} />}
          </tbody>
        </table>
      </TableCard>

      <TableCard title="Recent calls">
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
                <td className="px-3 py-2 font-mono max-w-[16rem] truncate" title={r.model_id}>
                  {shortModelName(r.model_id)}
                </td>
                <td className="px-3 py-2 font-mono">····{r.access_key_hint ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono">{compact(r.input_tokens)}</td>
                <td className="px-3 py-2 text-right font-mono">{compact(r.output_tokens)}</td>
                <td className="px-3 py-2 text-right font-mono">{compact(r.latency_ms)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(Number(r.est_cost_usd))}</td>
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
            {(!stats || stats.recent.length === 0) && <EmptyRow cols={8} label="No calls yet" />}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}

function TableCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function EmptyRow({ cols, label = "No calls in window" }: { cols: number; label?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-6 text-center text-muted-foreground text-sm">
        {label}
      </td>
    </tr>
  );
}
