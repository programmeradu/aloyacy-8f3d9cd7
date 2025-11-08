import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import { IconWaves } from "@/components/Icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
          "Network reliability for Cyprus buses, learned in real time. Reliability index, hot and steady routes, refreshed every minute.",
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
  const excluded = data?.excludedUnknown ?? 0;

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
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                Reliability index
              </p>
              <p className="mt-1.5 font-display text-[80px] leading-none text-aegean-deep tabular-nums">
                {isLoading ? "—" : onTimePct}
                <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] align-top text-ink-soft">
                  /100
                </span>
              </p>
              <p className="mt-2 text-[13px] text-ink-soft max-w-[30ch]">
                A blended score across the live network. 100 = on the dot, 0 = five minutes off or worse.
              </p>
            </div>
            <IconWaves className="size-12 text-aegean shrink-0" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="Routes learned" value={routesTracked} />
            <Stat label="Trips logged" value={totalSamples} />
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

      <HowItWorks excluded={excluded} />

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
      <p className="mt-1 font-sans font-medium text-2xl leading-none text-ink tabular-nums tracking-[-0.02em]">
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
            const longName = route?.long ?? r.routeId;
            // Responsive sizes: long names shrink so they fit on one line at 390px wide.
            const nameClass =
              longName.length > 44
                ? "text-[13px] leading-snug"
                : longName.length > 30
                ? "text-[15px] leading-snug"
                : "text-[17px] leading-snug";
            const delayAbs = Math.abs(delayMin);
            const delayClass =
              delayAbs >= 100
                ? "text-[18px]"
                : delayAbs >= 10
                ? "text-[22px]"
                : "text-[26px]";
            return (
              <Link
                key={r.routeId}
                to="/route/$routeId"
                params={{ routeId: r.routeId }}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-limestone-soft active:bg-limestone-soft/80"
              >
                <RouteChip code={route?.short ?? "?"} tone={routeTone(r.routeId)} />
                <div className="min-w-0 flex-1">
                  <p className={`font-display text-ink truncate ${nameClass}`}>
                    {longName}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                    {r.sampleCount.toLocaleString()} trips logged
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {showDelay ? (
                    <p
                      className={`font-sans font-medium leading-none tabular-nums tracking-[-0.02em] ${delayClass} ${
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
                    <p className="font-sans font-medium text-[24px] leading-none text-aegean-deep tabular-nums tracking-[-0.02em]">
                      {r.onTimePct}
                      <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                        /100
                      </span>
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function HowItWorks({ excluded }: { excluded: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-10 px-6 animate-rise" style={{ animationDelay: "260ms" }}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between rounded-3xl bg-card ring-1 ring-line px-5 py-4 text-left">
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              The honest part
            </span>
            <span className="block font-display text-xl mt-0.5 text-ink">
              How this is calculated
            </span>
          </span>
          <span className="font-mono text-[11px] text-ink-soft">
            {open ? "Close" : "Open"}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 rounded-3xl bg-limestone-soft p-5 ring-1 ring-line space-y-4 text-[13px] leading-relaxed text-ink">
          <Item label="Reliability index">
            For each route we average the live delay across every trip we've
            observed, weighted by how many trips we have. We map that to a 0—100
            score where on the dot is 100 and five minutes off (early or late)
            is 0. It's a smooth proxy, not a strict on-time percentage.
          </Item>
          <Item label="Trips logged">
            One trip logged = one arrival event we pulled from the live feed
            for that route. More trips means a more trustworthy score.
          </Item>
          <Item label="Routes learned">
            Distinct routes with at least three trips observed in any
            hour-of-day bucket. Quiet routes appear once we've seen enough of them.
          </Item>
          <Item label="Running late / early">
            Routes whose weighted mean delay is more than 30 seconds off the
            schedule, with at least five trips logged.
          </Item>
          <Item label="Most reliable">
            Routes with at least eight trips logged, sorted by how close their
            mean delay sits to zero.
          </Item>
          <Item label="Limits to keep in mind">
            Delays come from each operator's live feed — if their data is off,
            ours will be too. Buckets are in UTC, not Cyprus local time, so the
            "at this hour" framing is approximate.
            {excluded > 0 ? (
              <>
                {" "}
                <strong className="font-medium">{excluded}</strong>{" "}
                {excluded === 1 ? "route is" : "routes are"} hidden here because
                they're not in our bundled timetable yet.
              </>
            ) : null}
          </Item>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
