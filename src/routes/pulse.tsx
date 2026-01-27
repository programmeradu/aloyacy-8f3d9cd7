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
import { useI18n, type DictKey } from "@/lib/i18n";
import { en } from "@/lib/dictionaries/en";
import pulseHero from "@/assets/pulse-hero.jpg";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: en["pulse.meta.title"] },
      { name: "description", content: en["pulse.meta.desc"] },
      { property: "og:title", content: en["pulse.og.title"] },
      { property: "og:description", content: en["pulse.og.desc"] },
    ],
  }),
  component: Pulse,
});

function Pulse() {
  const fn = useServerFn(getPulse);
  const { t } = useI18n();
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
          {t("pulse.kicker")}
        </p>
        <h1 className="relative font-display text-[40px] leading-[1.04] mt-1.5 text-ink text-balance">
          {t("pulse.title1")}
          <br />
          <span className="italic text-aegean-deep">{t("pulse.title2")}</span>
        </h1>
      </header>

      <section className="px-6 mt-2 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="rounded-[32px] bg-card p-6 ring-1 ring-line">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                {t("pulse.reliabilityIndex")}
              </p>
              <p className="mt-1.5 font-display text-[80px] leading-none text-aegean-deep tabular-nums">
                {isLoading ? "—" : onTimePct}
                <span className="ml-1 font-mono text-[12px] uppercase tracking-[0.18em] align-top text-ink-soft">
                  {t("pulse.outOf")}
                </span>
              </p>
              <p className="mt-2 text-[13px] text-ink-soft max-w-[30ch]">
                {t("pulse.reliabilityDesc")}
              </p>
            </div>
            <IconWaves className="size-12 text-aegean shrink-0" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label={t("pulse.routesLearned")} value={routesTracked} />
            <Stat label={t("pulse.tripsLogged")} value={totalSamples} />
          </div>
        </div>
      </section>


      <Section
        title={t("pulse.runningLate")}
        kicker={t("pulse.runningLate.kicker")}
        rows={data?.hottest ?? []}
        empty={t("pulse.runningLate.empty")}
        accent="ochre"
      />

      <Section
        title={t("pulse.runningEarly")}
        kicker={t("pulse.runningEarly.kicker")}
        rows={data?.coldest ?? []}
        empty={t("pulse.runningEarly.empty")}
        accent="olive"
      />

      <Section
        title={t("pulse.mostReliable")}
        kicker={t("pulse.mostReliable.kicker")}
        rows={data?.steadiest ?? []}
        empty={t("pulse.mostReliable.empty")}
        accent="aegean"
        showDelay={false}
      />

      <HowItWorks excluded={excluded} />

      <div className="px-6 pt-6 pb-2">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {t("pulse.updated")}
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
  const { t } = useI18n();
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
            const nameClass =
              longName.length > 38
                ? "text-[12.5px] leading-[1.25]"
                : longName.length > 26
                ? "text-[14px] leading-[1.25]"
                : "text-[16px] leading-[1.25]";
            const delayAbs = Math.abs(delayMin);
            const delayClass =
              delayAbs >= 100
                ? "text-[20px]"
                : delayAbs >= 10
                ? "text-[24px]"
                : "text-[28px]";
            return (
              <Link
                key={r.routeId}
                to="/route/$routeId"
                params={{ routeId: r.routeId }}
                className="flex items-center gap-2.5 px-3.5 py-3 transition-colors hover:bg-limestone-soft active:bg-limestone-soft/80"
              >
                <RouteChip code={route?.short ?? "?"} tone={routeTone(r.routeId)} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-display text-ink line-clamp-2 break-words ${nameClass}`}
                  >
                    {longName}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                    {t("pulse.tripsLoggedShort", { n: r.sampleCount.toLocaleString() })}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end leading-none">
                  {showDelay ? (
                    <>
                      <span
                        className={`font-sans font-medium tabular-nums tracking-[-0.02em] ${delayClass} ${
                          accent === "ochre"
                            ? "text-ochre"
                            : accent === "olive"
                            ? "text-olive"
                            : "text-aegean-deep"
                        }`}
                      >
                        {delayMin > 0 ? "+" : ""}
                        {delayMin}
                      </span>
                      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                        {t("pulse.min")}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-sans font-medium text-[26px] tabular-nums tracking-[-0.02em] text-aegean-deep">
                        {r.onTimePct}
                      </span>
                      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                        {t("pulse.outOf")}
                      </span>
                    </>
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
  const { t } = useI18n();
  const items: { labelKey: DictKey; bodyKey: DictKey }[] = [
    { labelKey: "pulse.item.reliability.label", bodyKey: "pulse.item.reliability.body" },
    { labelKey: "pulse.item.trips.label", bodyKey: "pulse.item.trips.body" },
    { labelKey: "pulse.item.routes.label", bodyKey: "pulse.item.routes.body" },
    { labelKey: "pulse.item.lateEarly.label", bodyKey: "pulse.item.lateEarly.body" },
    { labelKey: "pulse.item.mostReliable.label", bodyKey: "pulse.item.mostReliable.body" },
  ];
  return (
    <section className="mt-10 px-6 animate-rise" style={{ animationDelay: "260ms" }}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between rounded-3xl bg-card ring-1 ring-line px-5 py-4 text-left">
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("pulse.honest")}
            </span>
            <span className="block font-display text-xl mt-0.5 text-ink">
              {t("pulse.howCalc")}
            </span>
          </span>
          <span className="font-mono text-[11px] text-ink-soft">
            {open ? t("pulse.close") : t("pulse.open")}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 rounded-3xl bg-limestone-soft p-5 ring-1 ring-line space-y-4 text-[13px] leading-relaxed text-ink">
          {items.map((it) => (
            <Item key={it.labelKey} label={t(it.labelKey)}>{t(it.bodyKey)}</Item>
          ))}
          <Item label={t("pulse.item.limits.label")}>
            {t("pulse.item.limits.body")}
            {excluded > 0 ? (
              <>
                {" "}
                {t(excluded === 1 ? "pulse.excluded.one" : "pulse.excluded.many", { n: excluded })}
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
