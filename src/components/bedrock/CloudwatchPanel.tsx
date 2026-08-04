import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  axisTicks,
  compact,
  describeCreds,
  formatAxisTs,
  formatPeriod,
  formatWindow,
  money,
} from "@aloya/core/bedrock-metering";
import { getBedrockCloudwatchStats, type BedrockCwStats } from "@/lib/bedrock-cloudwatch.functions";
import { Kpi } from "./Kpi";
import { AxisTicks, BarSeries } from "./BarSeries";
import { useSessionCreds } from "./useSessionCreds";

const CW_STORAGE = "bedrock-cw-creds";

/** Account-wide Bedrock activity straight from CloudWatch (~1-2 min lag). */
export function CloudwatchPanel() {
  const fetchCw = useServerFn(getBedrockCloudwatchStats);
  const { combined, setCombined, settings, patch, parsed } = useSessionCreds(CW_STORAGE, {
    region: "us-west-2",
    hours: 24,
    enabled: false,
  });
  const { region, hours, enabled } = settings;
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

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">AWS-wide · CloudWatch</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
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
          <label className="space-y-1.5 min-w-0">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              AWS creds · <span className="font-mono">AKIA…:SECRET[:region][:sessionToken]</span>
            </div>
            <textarea
              value={combined}
              onChange={(e) => setCombined(e.target.value)}
              placeholder="AKIA...:SECRET:us-west-2"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-mono resize-none"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Region</div>
            <input
              value={region}
              onChange={(e) => patch({ region: e.target.value })}
              placeholder="us-west-2"
              className="w-full sm:w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="space-y-1.5">
            <div className="text-xs font-mono uppercase text-muted-foreground">Window</div>
            <select
              value={hours}
              onChange={(e) => patch({ hours: Number(e.target.value) })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
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
              onClick={() => patch({ enabled: !enabled })}
              className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enabled ? "Live · pause" : "Start live"}
            </button>
          </div>
        </div>

        {parsed && (
          <div className="text-[10px] font-mono text-muted-foreground break-words">
            {describeCreds(parsed, effectiveRegion)}
          </div>
        )}
        {!parsed && combined.length > 0 && (
          <div className="text-xs text-destructive font-mono">
            Could not parse — expected AKIA…:SECRET[:region][:sessionToken]
          </div>
        )}
        {q.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-xs font-mono break-words">
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
                sub={`${formatWindow(cw.windowHours)} window`}
              />
              <Kpi
                label="Output tokens"
                value={compact(cw.totals.outputTokens)}
                sub={`${formatWindow(cw.windowHours)} window`}
              />
              <Kpi
                label="Models seen"
                value={compact(cw.perModel.length)}
                sub={q.isFetching ? "refreshing…" : "auto-refresh 60s"}
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xs font-mono uppercase text-muted-foreground">
                  Invocations · {formatWindow(cw.windowHours)}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  bucket {formatPeriod(cw.periodSeconds)} · {cw.perMinute.length} points
                </div>
              </div>
              <BarSeries
                color="color-mix(in oklch, var(--aegean) 80%, transparent)"
                points={cw.perMinute.map((p) => ({
                  key: p.t,
                  value: p.invocations,
                  title: `${new Date(p.t).toLocaleString()} · ${compact(p.invocations)} calls · ${money(p.estCostUsd)}`,
                }))}
              />
              <AxisTicks
                labels={axisTicks(cw.perMinute).map((p) => formatAxisTs(p.t, cw.windowHours))}
              />
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
                  {cw.perModel.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        No models reported in window
                      </td>
                    </tr>
                  )}
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
