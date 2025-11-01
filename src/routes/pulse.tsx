import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import { IconWaves } from "@/components/Icons";
import { getPulse, type PulseRouteStat } from "@/lib/pulse.functions";
import { getRoute, routeTone } from "@/lib/gtfs";
import pulseHero from "@/assets/pulse-hero.jpg";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: "Pulse — Aloya" },
      {
        name: "description",
        content:
          "Network reliability for Cyprus buses, learned in real time. On-time percentage, hot and steady routes, refreshed every minute.",
      },
      { property: "og:title", content: "Aloya Pulse — the island's transit, in motion" },
      {
        property: "og:description",
        content:
          "Real reliability for Cyprus public transport, learned from the live feed.",
      },
    ],
  }),
  component: Pulse,
});

function Pulse() {
  const fn = useServerFn(getPulse);
  const { data, isLoading } = useQuery({
    queryKey: ["pulse"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const totalSamples = data?.totalSamples ?? 0;
  const onTimePct = data?.onTimePct ?? 0;
  const routesTracked = data?.routesTracked ?? 0;

  return (
    <AppShell>
      <header className="relative px-6 pt-2 pb-4 animate-rise">
        <img
          src={pulseHero}
          alt=""
          aria-hidden
          loading="lazy"
          width={1280}
          height={896}
          className="pointer-events-none absolute inset-x-0 top-[-4%] mx-auto w-[88%] opacity-[0.22] mix-blend-multiply"
        />
        <p className="relative font-mono text-[10px] uppercase tracking-[0.24em] text-ink-soft">
          Network, learned in real time
        </p>
        <h1 className="relative font-display text-[40px] leading-[1.04] mt-1.5 text-ink text-balance">
          The island,
          <br />
          <span className="italic text-aegean-deep">in motion.</span>
        </h1>
      </header>

      <section className="px-6 mt-2 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="rounded-[32px] bg-card p-6 ring-1 ring-line">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                Right now
              </p>
              <p className="mt-1.5 font-display text-[80px] leading-none text-aegean-deep tabular-nums">
                {isLoading ? "—" : onTimePct}
                <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] align-top text-ink-soft">
                  %
                </span>
              </p>
              <p className="mt-2 text-[13px] text-ink-soft max-w-[28ch]">
                of stops served within two minutes of the schedule, blended across the whole live network.
              </p>
            </div>
            <IconWaves className="size-12 text-aegean" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="Routes learned" value={routesTracked} />
            <Stat label="Samples blended" value={totalSamples} />
          </div>
        </div>
      </section>

      <Section
        title="Running late"
        kicker="Higher delay learned at this hour"
        rows={data?.hottest ?? []}
        empty="Nothing dragging today. The network's calm."
        accent="ochre"
      />

      <Section
        title="Running early"
        kicker="Beating schedule — leave a minute sooner"
        rows={data?.coldest ?? []}
        empty="No routes are leaving ahead of schedule."
        accent="olive"
      />

      <Section
        title="Most reliable"
        kicker="Closest to the printed timetable"
        rows={data?.steadiest ?? []}
        empty="We need more data. Check back tomorrow."
        accent="aegean"
        showDelay={false}
      />

      <div className="px-6 pt-6 pb-2">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          Updated every minute from the live feed
        </p>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-limestone-soft p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl leading-none text-ink tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Section({
  title,
  kicker,
  rows,
  empty,
  accent,
  showDelay = true,
}: {
  title: string;
  kicker: string;
  rows: PulseRouteStat[];
  empty: string;
  accent: "ochre" | "olive" | "aegean";
  showDelay?: boolean;
}) {
  return (
    <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
      <div className="mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {kicker}
        </p>
        <h2 className="font-display text-2xl mt-1 text-ink">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-3xl bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
          {empty}
        </div>
      ) : (
        <div className="rounded-3xl bg-card ring-1 ring-line divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const route = getRoute(r.routeId);
            const delayMin = Math.round(r.meanDelaySec / 60);
            return (
              <div key={r.routeId} className="flex items-center gap-4 p-4">
                <RouteChip code={route?.short ?? "?"} tone={routeTone(r.routeId)} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight text-ink truncate">
                    {route?.long ?? r.routeId}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {r.sampleCount.toLocaleString()} samples
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {showDelay ? (
                    <p
                      className={`font-display text-2xl leading-none tabular-nums ${
                        accent === "ochre"
                          ? "text-ochre"
                          : accent === "olive"
                          ? "text-olive"
                          : "text-aegean-deep"
                      }`}
                    >
                      {delayMin > 0 ? "+" : ""}
                      {delayMin}
                      <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                        min
                      </span>
                    </p>
                  ) : (
                    <p className="font-display text-2xl leading-none text-aegean-deep tabular-nums">
                      {r.onTimePct}
                      <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                        %
                      </span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
