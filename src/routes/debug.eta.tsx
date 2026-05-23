import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getAccuracySnapshot } from "@/lib/learning.functions";
import { getRoute } from "@/lib/gtfs";

export const Route = createFileRoute("/debug/eta")({
  head: () => ({
    meta: [
      { title: "ETA accuracy — debug" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DebugEta,
});

function fmtSec(s: number) {
  const sign = s < 0 ? "−" : s > 0 ? "+" : "";
  const a = Math.abs(s);
  if (a < 60) return `${sign}${a}s`;
  const m = Math.floor(a / 60);
  const r = a % 60;
  return `${sign}${m}m${r ? ` ${r}s` : ""}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function DebugEta() {
  const fn = useServerFn(getAccuracySnapshot);
  const [hours, setHours] = useState(24);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["accuracy", hours],
    queryFn: () => fn({ data: { hours, limit: 300 } }),
    refetchInterval: 60_000,
  });

  return (
    <div className="min-h-screen bg-limestone">
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-24">
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
            internal / not indexed
          </p>
          <h1 className="font-display text-[44px] leading-[1.05] text-ink mt-2">
            ETA accuracy
          </h1>
          <p className="font-sans text-[14px] leading-[1.55] text-ink-soft mt-3 max-w-xl">
            Operator-predicted arrivals vs. when the bus actually passed the stop, captured
            from the live feed. Lower numbers mean Motion's ETA was closer to reality.
            Negative = bus arrived early. Positive = bus arrived late.
          </p>
        </header>

        <div className="flex items-center gap-3 mb-8">
          {[1, 6, 24, 72].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`font-mono text-[11px] uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ring-1 transition-colors ${
                hours === h
                  ? "bg-ink text-limestone ring-ink"
                  : "bg-white text-ink-soft ring-line hover:text-ink"
              }`}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="ml-auto font-mono text-[11px] uppercase tracking-[0.18em] text-aegean-deep"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Totals */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Stat label="Samples" value={data?.totals.count?.toString() ?? "—"} />
          <Stat
            label="Mean bias"
            value={data ? fmtSec(data.totals.meanSec) : "—"}
            hint="bus vs. ETA"
          />
          <Stat
            label="Median miss"
            value={data ? fmtSec(data.totals.p50Sec) : "—"}
            hint="absolute"
          />
          <Stat
            label="P90 miss"
            value={data ? fmtSec(data.totals.p90Sec) : "—"}
            hint="absolute"
          />
        </section>

        {/* By route */}
        <section className="mb-12">
          <h2 className="font-display text-[26px] text-ink mb-4">By route</h2>
          <div className="rounded-2xl bg-white ring-1 ring-line overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft border-b border-line">
              <span>Route</span>
              <span className="text-right">N</span>
              <span className="text-right">Mean</span>
              <span className="text-right">P90 |Δ|</span>
            </div>
            {data?.byRoute.map((r) => {
              const meta = getRoute(r.routeId);
              return (
                <div
                  key={r.routeId}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2.5 items-baseline border-b border-line last:border-0"
                >
                  <span className="font-sans text-[13px] text-ink truncate">
                    <span className="font-mono text-[11px] text-ink-soft mr-2">
                      {meta?.shortName ?? r.routeId}
                    </span>
                    {meta?.longName ?? ""}
                  </span>
                  <span className="font-mono text-[12px] text-ink-soft text-right tabular-nums">
                    {r.count}
                  </span>
                  <span
                    className={`font-mono text-[12px] text-right tabular-nums ${
                      Math.abs(r.meanSec) > 120 ? "text-ochre-deep" : "text-ink"
                    }`}
                  >
                    {fmtSec(r.meanSec)}
                  </span>
                  <span className="font-mono text-[12px] text-ink-soft text-right tabular-nums">
                    {fmtSec(r.p90AbsSec)}
                  </span>
                </div>
              );
            })}
            {!data?.byRoute.length && (
              <div className="px-4 py-6 text-center font-sans text-[13px] text-ink-soft">
                No observed arrivals in this window yet.
              </div>
            )}
          </div>
        </section>

        {/* Recent stream */}
        <section>
          <h2 className="font-display text-[26px] text-ink mb-4">Recent arrivals</h2>
          <div className="rounded-2xl bg-white ring-1 ring-line overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft border-b border-line">
              <span>Route</span>
              <span>Stop / trip</span>
              <span className="text-right">Predicted</span>
              <span className="text-right">Miss</span>
            </div>
            {data?.recent.map((r, i) => {
              const meta = getRoute(r.routeId);
              return (
                <div
                  key={`${r.tripId}-${r.stopId}-${i}`}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 px-4 py-2.5 items-baseline border-b border-line last:border-0"
                >
                  <span className="font-mono text-[11px] text-ink-soft">
                    {meta?.shortName ?? r.routeId}
                  </span>
                  <span className="font-sans text-[12px] text-ink truncate">
                    stop {r.stopId}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft text-right tabular-nums">
                    {fmtTime(r.predictedAt)}
                  </span>
                  <span
                    className={`font-mono text-[12px] text-right tabular-nums ${
                      Math.abs(r.delaySec) > 180
                        ? "text-ochre-deep"
                        : Math.abs(r.delaySec) < 60
                          ? "text-olive-deep"
                          : "text-ink"
                    }`}
                  >
                    {fmtSec(r.delaySec)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-line p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <p className="font-display text-[28px] leading-none text-ink mt-2 tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft mt-1.5">
          {hint}
        </p>
      )}
    </div>
  );
}
