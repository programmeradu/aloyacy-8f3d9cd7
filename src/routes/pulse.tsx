import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getPulse, getLivePulse, type PulseRouteStat } from "@/lib/pulse.functions";
import { getRoute, routeTone } from "@/lib/gtfs";
import { useI18n, type DictKey } from "@/lib/i18n";
import { en } from "@/lib/dictionaries/en";
import pulseNetwork from "@/assets/pulse-network.jpg";

export const Route = createFileRoute("/pulse")({
  head: () => ({
    meta: [
      { title: en["pulse.meta.title"] },
      { name: "description", content: en["pulse.meta.desc"] },
      { property: "og:title", content: en["pulse.og.title"] },
      { property: "og:description", content: en["pulse.og.desc"] },
      { property: "og:url", content: "https://app.aloya.cy/pulse" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.aloya.cy/og/og-pulse.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Hand-drawn map of Cyprus with ochre bus routes traced across the island." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://app.aloya.cy/og/og-pulse.jpg" },
    ],
    links: [
      { rel: "canonical", href: "https://app.aloya.cy/pulse" },
      { rel: "alternate", hrefLang: "en", href: "https://app.aloya.cy/pulse" },
      { rel: "alternate", hrefLang: "el", href: "https://app.aloya.cy/pulse" },
      { rel: "alternate", hrefLang: "x-default", href: "https://app.aloya.cy/pulse" },
    ],
  }),
  component: Pulse,
});

function Pulse() {
  const fn = useServerFn(getPulse);
  const liveFn = useServerFn(getLivePulse);
  const { t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["pulse"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const { data: live } = useQuery({
    queryKey: ["pulse-live"],
    queryFn: () => liveFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const onTimePct = data?.onTimePct ?? 0;
  const routesTracked = data?.routesTracked ?? 0;
  const totalSamples = data?.totalSamples ?? 0;
  const excluded = data?.excludedUnknown ?? 0;

  return (
    <AppShell>
      {/* ───────── Hero ───────── */}
      <header className="relative px-6 pt-3 pb-2 animate-rise">
        <p className="font-eyebrow text-[10px] uppercase tracking-[0.24em] text-ink-soft">
          {t("pulse.kicker")}
        </p>
        <h1 className="font-display text-[44px] leading-[1.02] mt-2 text-ink text-balance">
          {t("pulse.title1")}
          <br />
          <span className="italic text-aegean-deep">{t("pulse.title2")}</span>
        </h1>
      </header>

      {/* ───────── Reliability dial + illustration ───────── */}
      <section className="px-6 mt-5 animate-rise" style={{ animationDelay: "80ms" }}>
        <div className="relative overflow-hidden rounded-[34px] bg-card ring-1 ring-line">
          <img
            src={pulseNetwork}
            alt=""
            aria-hidden
            loading="lazy"
            width={1280}
            height={896}
            className="pointer-events-none absolute -right-12 -top-6 w-[78%] opacity-[0.38] mix-blend-multiply select-none"
          />
          <div className="relative p-6">
            <div className="flex items-end gap-5">
              <ReliabilityDial value={isLoading ? 0 : onTimePct} />
              <div className="min-w-0 pb-1">
                <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                  {t("pulse.reliabilityIndex")}
                </p>
                <p className="mt-2 text-[13px] leading-snug text-ink-soft max-w-[24ch]">
                  {t("pulse.reliabilityDesc")}
                </p>
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <Stat label={t("pulse.routesLearned")} value={routesTracked} />
              <Stat label={t("pulse.tripsLogged")} value={totalSamples} />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Live network flow ribbon ───────── */}
      <section className="px-6 mt-6 animate-rise" style={{ animationDelay: "140ms" }}>
        <NetworkFlow
          late={live?.latePct ?? 0}
          onTime={live?.onTimePct ?? 0}
          early={live?.earlyPct ?? 0}
          observations={live?.observations ?? 0}
          median={live?.medianDelaySec ?? 0}
          title={t("pulse.flow.title")}
          kicker={t("pulse.flow.kicker")}
          labels={{
            late: t("pulse.flow.late"),
            onTime: t("pulse.flow.onTime"),
            early: t("pulse.flow.early"),
            obs: t("pulse.flow.observations", { n: (live?.observations ?? 0).toLocaleString() }),
            median: t("pulse.flow.median"),
            empty: t("pulse.flow.empty"),
            min: t("pulse.min"),
          }}
        />
      </section>

      {/* ───────── Sections ───────── */}
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
        mode="reliability"
      />

      <HowItWorks excluded={excluded} />

      <div className="px-6 pt-6 pb-2">
        <p className="text-center font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {t("pulse.updated")}
        </p>
      </div>
    </AppShell>
  );
}

/* ───────────────────────── Reliability dial ───────────────────────── */

function ReliabilityDial({ value }: { value: number }) {
  // Half-arc 180°, 84px wide. Stroke shows score along the arc.
  const pct = Math.max(0, Math.min(100, value));
  const R = 56;
  const C = Math.PI * R; // half-circumference
  const dash = (pct / 100) * C;
  return (
    <div className="relative w-[124px] h-[80px] shrink-0">
      <svg viewBox="0 0 140 80" className="absolute inset-0 w-full h-full">
        <path
          d="M14 70 A56 56 0 0 1 126 70"
          fill="none"
          stroke="oklch(0.22 0.012 110 / 0.08)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d="M14 70 A56 56 0 0 1 126 70"
          fill="none"
          stroke="var(--color-aegean-deep)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.32,0.72,0,1)" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
        <span className="font-display text-[44px] leading-none text-aegean-deep tabular-nums">
          {value || "—"}
        </span>
        <span className="ml-1 mb-1 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          /100
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── Stat tile ───────────────────────── */

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-limestone-soft p-3.5">
      <p className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1 font-sans font-medium text-2xl leading-none text-ink tabular-nums tracking-[-0.02em]">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

/* ───────────────────────── Network flow ribbon ───────────────────────── */

function NetworkFlow({
  late,
  onTime,
  early,
  observations,
  median,
  title,
  kicker,
  labels,
}: {
  late: number;
  onTime: number;
  early: number;
  observations: number;
  median: number;
  title: string;
  kicker: string;
  labels: { late: string; onTime: string; early: string; obs: string; median: string; empty: string; min: string };
}) {
  const total = late + onTime + early;
  const hasData = observations > 0 && total > 0;
  const medianMin = Math.round(median / 60);
  return (
    <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {kicker}
          </p>
          <h2 className="mt-1 font-display text-[20px] leading-tight text-ink">{title}</h2>
        </div>
        {hasData && (
          <div className="text-right shrink-0">
            <p className="font-sans font-medium text-[18px] leading-none text-ink tabular-nums">
              {medianMin > 0 ? "+" : ""}
              {medianMin}
              <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                {labels.min}
              </span>
            </p>
            <p className="mt-1 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
              {labels.median}
            </p>
          </div>
        )}
      </div>

      {hasData ? (
        <>
          <div className="mt-5 h-3 w-full rounded-full overflow-hidden flex bg-limestone-soft">
            {late > 0 && (
              <div
                className="h-full bg-ochre transition-all duration-700"
                style={{ width: `${late}%` }}
              />
            )}
            {onTime > 0 && (
              <div
                className="h-full bg-aegean-deep transition-all duration-700"
                style={{ width: `${onTime}%` }}
              />
            )}
            {early > 0 && (
              <div
                className="h-full bg-olive transition-all duration-700"
                style={{ width: `${early}%` }}
              />
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <FlowLeg color="ochre" label={labels.late} pct={late} />
            <FlowLeg color="aegean-deep" label={labels.onTime} pct={onTime} />
            <FlowLeg color="olive" label={labels.early} pct={early} />
          </div>

          <p className="mt-4 font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
            {labels.obs}
          </p>
        </>
      ) : (
        <p className="mt-5 text-[13px] text-ink-soft">{labels.empty}</p>
      )}
    </div>
  );
}

function FlowLeg({ color, label, pct }: { color: "ochre" | "aegean-deep" | "olive"; label: string; pct: number }) {
  const dot =
    color === "ochre"
      ? "bg-ochre"
      : color === "olive"
      ? "bg-olive"
      : "bg-aegean-deep";
  const text =
    color === "ochre"
      ? "text-ochre"
      : color === "olive"
      ? "text-olive"
      : "text-aegean-deep";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-3 rounded-full ${dot}`} />
        <span className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </span>
      </div>
      <span className={`font-sans font-medium text-[22px] leading-none tabular-nums tracking-[-0.02em] ${text}`}>
        {pct}
        <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          %
        </span>
      </span>
    </div>
  );
}

/* ───────────────────────── Route list section ───────────────────────── */

function Section({
  title,
  kicker,
  rows,
  empty,
  accent,
  mode = "delay",
}: {
  title: string;
  kicker: string;
  rows: PulseRouteStat[];
  empty: string;
  accent: "ochre" | "olive" | "aegean";
  mode?: "delay" | "reliability";
}) {
  const { t } = useI18n();
  const maxMag =
    mode === "delay"
      ? Math.max(60, ...rows.map((r) => Math.abs(r.meanDelaySec)))
      : 100;

  return (
    <section className="mt-9 px-6 animate-rise" style={{ animationDelay: "200ms" }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {kicker}
          </p>
          <h2 className="font-display text-2xl mt-1 text-ink">{title}</h2>
        </div>
        <span className={`h-1 w-10 rounded-full shrink-0 ${
          accent === "ochre" ? "bg-ochre" : accent === "olive" ? "bg-olive" : "bg-aegean-deep"
        }`} />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-[26px] bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
          {empty}
        </div>
      ) : (
        <div className="rounded-[26px] bg-card ring-1 ring-line divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const route = getRoute(r.routeId);
            const delayMin = Math.round(r.meanDelaySec / 60);
            const longName = route?.long ?? r.routeId;
            const nameClass =
              longName.length > 38
                ? "text-[12.5px] leading-[1.25]"
                : longName.length > 26
                ? "text-[14px] leading-[1.25]"
                : "text-[15px] leading-[1.25]";
            return (
              <Link
                key={r.routeId}
                to="/route/$routeId"
                params={{ routeId: r.routeId }}
                className="block px-4 py-3.5 transition-colors hover:bg-limestone-soft active:bg-limestone-soft/80"
              >
                <div className="flex items-start gap-2.5">
                  <RouteChip code={route?.short ?? "?"} tone={routeTone(r.routeId)} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-display text-ink line-clamp-2 break-words ${nameClass}`}>
                      {longName}
                    </p>
                    <p className="mt-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                      {t("pulse.tripsLoggedShort", { n: r.sampleCount.toLocaleString() })}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end leading-none pl-1">
                    {mode === "delay" ? (
                      <>
                        <span
                          className={`font-sans font-medium tabular-nums tracking-[-0.02em] text-[26px] ${
                            accent === "ochre" ? "text-ochre" : accent === "olive" ? "text-olive" : "text-aegean-deep"
                          }`}
                        >
                          {delayMin > 0 ? "+" : ""}
                          {delayMin}
                        </span>
                        <span className="mt-1 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                          {t("pulse.min")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-sans font-medium text-[26px] tabular-nums tracking-[-0.02em] text-aegean-deep">
                          {r.onTimePct}
                        </span>
                        <span className="mt-1 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                          {t("pulse.outOf")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Mini visualization bar */}
                <div className="mt-2.5 ml-[44px] h-1 rounded-full bg-limestone-soft overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      mode === "reliability"
                        ? "bg-aegean-deep"
                        : accent === "ochre"
                        ? "bg-ochre"
                        : "bg-olive"
                    }`}
                    style={{
                      width: `${Math.max(
                        6,
                        Math.min(
                          100,
                          mode === "reliability"
                            ? r.onTimePct
                            : (Math.abs(r.meanDelaySec) / maxMag) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── How it works ───────────────────────── */

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
        <CollapsibleTrigger className="w-full flex items-center justify-between rounded-[26px] bg-card ring-1 ring-line px-5 py-4 text-left">
          <span>
            <span className="block font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("pulse.honest")}
            </span>
            <span className="block font-display text-xl mt-0.5 text-ink">
              {t("pulse.howCalc")}
            </span>
          </span>
          <span className="font-eyebrow text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {open ? t("pulse.close") : t("pulse.open")}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 rounded-[26px] bg-limestone-soft p-5 ring-1 ring-line space-y-4 text-[13px] leading-relaxed text-ink">
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
      <p className="font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
        {label}
      </p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
