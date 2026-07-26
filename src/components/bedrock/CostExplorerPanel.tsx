import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axisTicks,
  effectiveGranularity,
  formatAxisTs,
  money2,
  spendShare,
} from "@aloya/core/bedrock-metering";
import {
  getBedrockCostExplorer,
  type BedrockCeStats,
} from "@/lib/bedrock-cost-explorer.functions";
import { Kpi } from "./Kpi";
import { AxisTicks, BarSeries } from "./BarSeries";
import { useSessionCreds } from "./useSessionCreds";

const CE_STORAGE = "bedrock-ce-creds";

/** Real billed Bedrock spend from Cost Explorer — delayed, cached, ~$0.01 a call. */
export function CostExplorerPanel() {
  const fetchCe = useServerFn(getBedrockCostExplorer);
  const { combined, setCombined, settings, patch, parsed } = useSessionCreds(CE_STORAGE, {
    days: 14,
    granularity: "DAILY" as "HOURLY" | "DAILY",
    enabled: false,
  });
  const { days, granularity, enabled } = settings;
  const granularityInUse = effectiveGranularity(days, granularity);

  const q = useQuery({
    queryKey: ["bedrock-ce", parsed?.accessKeyId, days, granularityInUse, enabled],
    queryFn: async () => {
      if (!parsed) throw new Error("No credentials");
      return fetchCe({
        data: {
          accessKeyId: parsed.accessKeyId,
          secretAccessKey: parsed.secretAccessKey,
          sessionToken: parsed.sessionToken,
          days,
          granularity: granularityInUse,
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
  const axisHours = ce?.granularity === "HOURLY" ? 24 : 999;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">AWS-wide · Cost Explorer</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
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
          <label className="space-y-1.5 min-w-0">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              AWS creds · needs <span className="font-mono">ce:GetCostAndUsage</span>
            </div>
            <textarea
              value={combined}
              onChange={(e) => setCombined(e.target.value)}
              placeholder="AKIA...:SECRET (reuses the CloudWatch key if it has ce:GetCostAndUsage)"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono resize-none"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Window</div>
            <select
              value={days}
              onChange={(e) => patch({ days: Number(e.target.value) })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {[1, 3, 7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} day{d === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Granularity</div>
            <select
              value={granularityInUse}
              disabled={days > 14}
              onChange={(e) => patch({ granularity: e.target.value as "HOURLY" | "DAILY" })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
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
                if (!enabled) patch({ enabled: true });
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
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-xs font-mono break-words">
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xs font-mono uppercase text-muted-foreground">
                  Spend · {days}d · {ce.granularity.toLowerCase()}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {ce.perBucket.length} buckets
                </div>
              </div>
              <BarSeries
                heightClass="h-32"
                gapClass="gap-[3px]"
                minWidthClass="min-w-[3px]"
                color="color-mix(in oklch, var(--ochre) 80%, transparent)"
                emptyLabel="No spend in window"
                points={ce.perBucket.map((p) => ({
                  key: p.start,
                  value: p.total,
                  title: `${new Date(p.start).toLocaleString()} · ${money2(p.total)}`,
                }))}
              />
              <AxisTicks
                labels={axisTicks(ce.perBucket).map((p) => formatAxisTs(p.start, axisHours))}
              />
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
                    {ce.perModel.map((m) => (
                      <tr key={m.key} className="border-t border-border">
                        <td className="px-4 py-2 font-mono text-xs break-all">{m.key}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold">
                          {money2(m.amount)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                          {spendShare(m.amount, ce.totals.windowSpend).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
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
