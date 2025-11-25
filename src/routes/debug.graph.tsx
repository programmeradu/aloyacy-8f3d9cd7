import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTransferGraphDiagnostics } from "@/lib/transfer-graph.functions";

export const Route = createFileRoute("/debug/graph")({
  head: () => ({
    meta: [
      { title: "Transfer graph — Phase 1 checkpoint" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DebugGraph,
});

function DebugGraph() {
  const fn = useServerFn(getTransferGraphDiagnostics);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["transfer-graph-diag"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });

  return (
    <main className="min-h-dvh bg-limestone text-ink">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <header>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
            Phase 1 checkpoint
          </p>
          <h1 className="mt-1.5 font-display text-[36px] leading-[1.04] text-ink text-balance">
            The transfer
            <br />
            <span className="italic text-aegean-deep">skeleton.</span>
          </h1>
          <p className="mt-3 max-w-[52ch] text-[13px] text-ink-soft leading-relaxed">
            Stop adjacency and the candidate set the multi-leg search will
            explore. Built once per server cold-start, in memory. Numbers
            below are the sanity check before Phase 2.
          </p>
        </header>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="rounded-full bg-ink px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-limestone hover:bg-aegean-deep transition-colors"
          >
            {isFetching ? "Rebuilding…" : "Rebuild & measure"}
          </button>
          {data ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              built in {data.buildMs} ms
            </span>
          ) : null}
        </div>

        {!data ? (
          <p className="mt-10 font-mono text-[11px] text-ink-soft">
            Loading the graph…
          </p>
        ) : (
          <>
            <section className="mt-10 grid grid-cols-2 gap-3">
              <Tile label="Total stops in feed" value={data.totalStops} />
              <Tile label="Stops on a known route" value={data.stats.stopsWithRoutes} />
              <Tile
                label="Stops with transfer candidates"
                value={data.stats.stopsWithTransferCandidates}
              />
              <Tile
                label="Candidate pairs"
                value={data.stats.totalTransferCandidatePairs}
              />
              <Tile
                label="Avg candidates / stop"
                value={data.stats.avgCandidatesPerStop}
              />
              <Tile label="Build time" value={`${data.buildMs} ms`} />
            </section>

            <section className="mt-10">
              <h2 className="font-display text-[22px] text-ink">Candidate distribution</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft mt-1">
                How many transfer candidates each stop has
              </p>
              <div className="mt-4 rounded-[24px] bg-card ring-1 ring-line p-5">
                {data.histogram.map((h) => {
                  const max = Math.max(...data.histogram.map((x) => x.stops), 1);
                  const pct = (h.stops / max) * 100;
                  return (
                    <div
                      key={h.bucket}
                      className="flex items-center gap-4 py-2 border-b border-line/50 last:border-0"
                    >
                      <span className="w-16 font-mono text-[11px] text-ink-soft">
                        {h.bucket}
                      </span>
                      <div className="flex-1 h-2 bg-limestone-soft rounded-full overflow-hidden">
                        <div
                          className="h-full bg-aegean-deep rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right font-sans text-[14px] tabular-nums text-ink">
                        {h.stops.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="font-display text-[22px] text-ink">Hub stops</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft mt-1">
                Most transfer-rich — sanity check these by hand
              </p>
              <ol className="mt-4 rounded-[24px] bg-card ring-1 ring-line divide-y divide-line/60">
                {data.topHubs.map((h, i) => (
                  <li key={h.stopId} className="flex items-baseline gap-4 px-5 py-3">
                    <span className="w-6 font-mono text-[11px] text-ink-soft tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans text-[14px] text-ink truncate">{h.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-0.5">
                        stop {h.stopId} · {h.nearestMeters}—{h.farthestMeters} m range
                      </p>
                    </div>
                    <span className="font-display text-[24px] text-aegean-deep tabular-nums">
                      {h.candidateCount}
                    </span>
                  </li>
                ))}
              </ol>
            </section>

            <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft text-center">
              Phase 1 of 5 — foundation
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-line p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <p className="mt-2 font-display text-[28px] leading-none text-ink tabular-nums tracking-[-0.01em]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
