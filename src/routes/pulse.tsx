import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteChip } from "@/components/RouteChip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getPulse,
  getLivePulse,
  getPulseHourStrip,
  type PulseRouteStat,
  type HourBucket,
} from "@/lib/pulse.functions";
import { getRoute, routeTone } from "@/lib/gtfs";
import { useI18n, type DictKey } from "@/lib/i18n";
import { en } from "@/lib/dictionaries/en";
import pulseHero from "@/assets/pulse-hero-cyprus.jpg";

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
      { property: "og:image:alt", content: "Hand-painted map of Cyprus with ochre buses tracing routes across the island." },
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
  const hourFn = useServerFn(getPulseHourStrip);
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
  const { data: hourly } = useQuery({
    queryKey: ["pulse-hourly"],
    queryFn: () => hourFn(),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const onTimePct = data?.onTimePct ?? 0;
  const routesTracked = data?.routesTracked ?? 0;
  const totalSamples = data?.totalSamples ?? 0;
  const excluded = data?.excludedUnknown ?? 0;

  // "Typical" baseline = mean of |delay|→OTP across the last-24h hourly strip.
  // Honest proxy: it's our best lookback without a separate historical store.
  const typicalOTP = useMemo(() => {
    if (!hourly?.buckets?.length) return null;
    let sum = 0;
    let weight = 0;
    for (const b of hourly.buckets) {
      if (b.sampleCount === 0) continue;
      const otp = Math.max(
        0,
        Math.min(100, Math.round((1 - Math.min(Math.abs(b.meanDelaySec), 300) / 300) * 100)),
      );
      sum += otp * b.sampleCount;
      weight += b.sampleCount;
    }
    return weight > 0 ? Math.round(sum / weight) : null;
  }, [hourly]);

  const delta = typicalOTP == null ? null : onTimePct - typicalOTP;

  const allRoutes = useMemo<PulseRouteStat[]>(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const out: PulseRouteStat[] = [];
    for (const r of [...data.hottest, ...data.coldest, ...data.steadiest]) {
      if (seen.has(r.routeId)) continue;
      seen.add(r.routeId);
      out.push(r);
    }
    return out;
  }, [data]);

  const insights = useMemo(() => buildInsights(data, delta, t), [data, delta, t]);

  return (
    <AppShell>
      {/* ───────── Weather hero ───────── */}
      <WeatherHero
        isLoading={isLoading}
        onTimePct={onTimePct}
        routesTracked={routesTracked}
        totalSamples={totalSamples}
        delta={delta}
        observations={live?.observations ?? 0}
        t={t}
      />

      {/* ───────── Insight chips ───────── */}
      {insights.length > 0 && (
        <section className="px-6 mt-6 animate-rise" style={{ animationDelay: "100ms" }}>
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft mb-3">
            {t("pulse.insight.kicker")}
          </p>
          <div className="flex flex-col gap-2.5">
            {insights.map((ins, i) => (
              <InsightLine key={i} tone={ins.tone}>
                {ins.text}
              </InsightLine>
            ))}
          </div>
        </section>
      )}

      {/* ───────── Today, hour by hour ───────── */}
      <section className="px-6 mt-7 animate-rise" style={{ animationDelay: "160ms" }}>
        <HourStrip
          buckets={hourly?.buckets ?? []}
          nowHour={hourly?.nowHour ?? new Date().getHours()}
          t={t}
        />
      </section>

      {/* ───────── Live flow river ───────── */}
      <section className="px-6 mt-6 animate-rise" style={{ animationDelay: "200ms" }}>
        <FlowRiver
          late={live?.latePct ?? 0}
          onTime={live?.onTimePct ?? 0}
          early={live?.earlyPct ?? 0}
          observations={live?.observations ?? 0}
          median={live?.medianDelaySec ?? 0}
          t={t}
        />
      </section>

      {/* ───────── Single ranked dot-strip ───────── */}
      <section className="mt-9 px-6 animate-rise" style={{ animationDelay: "240ms" }}>
        <RouteDotStrip rows={allRoutes} t={t} />
      </section>

      <HowItWorks excluded={excluded} />

      <div className="px-6 pt-6 pb-2">
        <p className="text-center font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {t("pulse.updated")}
        </p>
      </div>
    </AppShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Weather hero                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

type T = (k: DictKey, vars?: Record<string, string | number>) => string;

function moodKey(pct: number, hasData: boolean): DictKey {
  if (!hasData) return "pulse.mood.quiet";
  if (pct >= 88) return "pulse.mood.smooth";
  if (pct >= 72) return "pulse.mood.mostlySmooth";
  if (pct >= 55) return "pulse.mood.choppy";
  if (pct >= 35) return "pulse.mood.rough";
  return "pulse.mood.storming";
}

function WeatherHero({
  isLoading,
  onTimePct,
  routesTracked,
  totalSamples,
  delta,
  observations,
  t,
}: {
  isLoading: boolean;
  onTimePct: number;
  routesTracked: number;
  totalSamples: number;
  delta: number | null;
  observations: number;
  t: T;
}) {
  const hasData = !isLoading && totalSamples > 0;
  const mood = t(moodKey(onTimePct, hasData));
  const [moodHead, moodTail] = splitMood(mood);

  let sub = t("pulse.weather.subQuiet");
  if (hasData) {
    if (delta == null) {
      sub = `${onTimePct}% on time · ${routesTracked} routes learned`;
    } else if (delta > 1) {
      sub = t("pulse.weather.subPos", { pct: onTimePct, routes: routesTracked, delta: `+${delta}` });
    } else if (delta < -1) {
      sub = t("pulse.weather.subNeg", { pct: onTimePct, routes: routesTracked, delta: Math.abs(delta) });
    } else {
      sub = t("pulse.weather.subFlat", { pct: onTimePct, routes: routesTracked });
    }
  }

  return (
    <header className="relative px-6 pt-3 pb-1 animate-rise overflow-hidden">
      {/* Hero illustration anchored bottom-right, faint */}
      <img
        src={pulseHero}
        alt=""
        aria-hidden
        width={1536}
        height={1024}
        className="pointer-events-none absolute -right-10 -bottom-6 w-[78%] opacity-[0.55] mix-blend-multiply select-none"
      />
      <div className="relative">
        <p className="font-eyebrow text-[10px] uppercase tracking-[0.24em] text-ink-soft">
          {t("pulse.weather.kicker")}
        </p>
        <h1 className="font-display text-[40px] leading-[1.04] mt-2 text-ink text-balance max-w-[14ch]">
          {moodHead}
          {moodTail && (
            <>
              <br />
              <span className="italic text-aegean-deep">{moodTail}</span>
            </>
          )}
        </h1>
        <p className="mt-3 text-[13.5px] leading-snug text-ink-soft max-w-[34ch]">{sub}</p>

        {/* Score row */}
        <div className="mt-6 flex items-end gap-5">
          <ReliabilityRing value={hasData ? onTimePct : 0} typical={delta == null ? null : onTimePct - delta} />
          <div className="min-w-0 pb-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[44px] leading-none text-ink tabular-nums tracking-[-0.02em]">
                {hasData ? onTimePct : "—"}
              </span>
              <span className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft pb-1.5">
                /100
              </span>
            </div>
            {delta != null && hasData && (
              <DeltaBadge delta={delta} label={t("pulse.vsTypical")} />
            )}
            {observations > 0 && (
              <p className="mt-2 font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
                {observations.toLocaleString()} live · {totalSamples.toLocaleString()} learned
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function splitMood(s: string): [string, string] {
  // Put the first word on line 1 (caps, anchor) and the rest italic underneath.
  const i = s.indexOf(" ");
  if (i < 0) return [s, ""];
  return [s.slice(0, i), s.slice(i + 1)];
}

function DeltaBadge({ delta, label }: { delta: number; label: string }) {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const tone = delta >= 1 ? "olive" : delta <= -1 ? "ochre" : "ink-soft";
  const cls =
    tone === "olive"
      ? "text-olive bg-olive/10"
      : tone === "ochre"
      ? "text-ochre bg-ochre/10"
      : "text-ink-soft bg-limestone-soft";
  return (
    <span
      className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium tabular-nums tracking-[-0.01em] ${cls}`}
    >
      {sign}
      {Math.abs(delta)}
      <span className="font-eyebrow text-[8.5px] uppercase tracking-[0.2em] opacity-80">
        {label}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Reliability ring with ghost baseline                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function ReliabilityRing({ value, typical }: { value: number; typical: number | null }) {
  const size = 92;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cap = (v: number) => Math.max(0, Math.min(100, v));
  const todayDash = (cap(value) / 100) * c;
  const typicalDash = typical == null ? 0 : (cap(typical) / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="oklch(0.22 0.012 110 / 0.07)"
          strokeWidth={stroke}
        />
        {/* Typical (ghost) — dashed */}
        {typical != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="oklch(0.22 0.012 110 / 0.18)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${typicalDash} ${c}`}
            opacity={0.5}
          />
        )}
        {/* Today */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-aegean-deep)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${todayDash} ${c}`}
          style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.32,0.72,0,1)" }}
        />
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Hour strip — 24 cells colored by mean delay                                 */
/* ────────────────────────────────────────────────────────────────────────── */

function HourStrip({
  buckets,
  nowHour,
  t,
}: {
  buckets: HourBucket[];
  nowHour: number;
  t: T;
}) {
  const hasAny = buckets.some((b) => b.sampleCount > 0);
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {t("pulse.hour.kicker")}
          </p>
          <h2 className="mt-1 font-display text-[20px] leading-tight text-ink">
            {t("pulse.hour.title")}
          </h2>
        </div>
      </div>

      {hasAny ? (
        <>
          {/* Strip */}
          <div className="mt-5 grid grid-cols-24 gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {buckets.map((b) => {
              const isNow = b.hour === nowHour;
              const isFuture = b.hour > nowHour;
              const color = hourCellColor(b);
              return (
                <button
                  key={b.hour}
                  type="button"
                  aria-label={hourAriaLabel(b, t)}
                  onMouseEnter={() => setActive(b.hour)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(b.hour)}
                  onBlur={() => setActive(null)}
                  className={`relative h-9 rounded-[6px] transition-transform duration-200 ${
                    isFuture ? "opacity-40" : "opacity-100"
                  } ${isNow ? "ring-2 ring-ink ring-offset-[3px] ring-offset-card" : ""} ${
                    active === b.hour ? "scale-y-110" : ""
                  }`}
                  style={{ background: color }}
                />
              );
            })}
          </div>

          {/* Axis ticks: 00, 06, 12, 18 */}
          <div className="mt-2 grid" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="text-center font-eyebrow text-[8.5px] uppercase tracking-[0.16em] text-ink-soft">
                {[0, 6, 12, 18].includes(h) ? h.toString().padStart(2, "0") : ""}
              </div>
            ))}
          </div>

          {/* Active tooltip */}
          <div className="mt-3 min-h-[40px]">
            {active != null ? (
              <HourReadout bucket={buckets[active]} isNow={active === nowHour} t={t} />
            ) : (
              <HourReadout bucket={buckets[nowHour]} isNow t={t} />
            )}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <Legend swatch={hourCellColor({ hour: 0, meanDelaySec: -180, sampleCount: 10 })} label={t("pulse.hour.legendEarly")} />
            <Legend swatch={hourCellColor({ hour: 0, meanDelaySec: 0, sampleCount: 10 })} label={t("pulse.hour.legendOn")} />
            <Legend swatch={hourCellColor({ hour: 0, meanDelaySec: 240, sampleCount: 10 })} label={t("pulse.hour.legendLate")} />
          </div>
        </>
      ) : (
        <p className="mt-5 text-[13px] text-ink-soft">{t("pulse.hour.empty")}</p>
      )}
    </div>
  );
}

function hourCellColor(b: HourBucket): string {
  if (b.sampleCount === 0) return "oklch(0.92 0.005 95)";
  const d = b.meanDelaySec;
  // Diverging: olive (early) → aegean (on time) → ochre (late). Clamp at ±300s.
  const x = Math.max(-300, Math.min(300, d)) / 300; // -1..1
  if (x >= 0) {
    const t = x; // 0..1 → aegean → ochre
    return mix("oklch(0.62 0.10 200)", "oklch(0.70 0.16 65)", t);
  } else {
    const t = -x; // 0..1 → aegean → olive
    return mix("oklch(0.62 0.10 200)", "oklch(0.62 0.12 130)", t);
  }
}

function mix(a: string, b: string, t: number): string {
  return `color-mix(in oklab, ${a} ${Math.round((1 - t) * 100)}%, ${b} ${Math.round(t * 100)}%)`;
}

function hourAriaLabel(b: HourBucket, t: T): string {
  const hh = `${b.hour.toString().padStart(2, "0")}:00`;
  if (b.sampleCount === 0) return `${hh} — ${t("pulse.hour.tooltipQuiet")}`;
  const m = Math.round(b.meanDelaySec / 60);
  if (m > 0) return `${hh} — ${t("pulse.hour.tooltipLate", { min: m })}`;
  if (m < 0) return `${hh} — ${t("pulse.hour.tooltipEarly", { min: Math.abs(m) })}`;
  return `${hh} — ${t("pulse.hour.tooltipOn")}`;
}

function HourReadout({
  bucket,
  isNow,
  t,
}: {
  bucket: HourBucket;
  isNow: boolean;
  t: T;
}) {
  const m = Math.round(bucket.meanDelaySec / 60);
  const label =
    bucket.sampleCount === 0
      ? t("pulse.hour.tooltipQuiet")
      : m > 0
      ? t("pulse.hour.tooltipLate", { min: m })
      : m < 0
      ? t("pulse.hour.tooltipEarly", { min: Math.abs(m) })
      : t("pulse.hour.tooltipOn");
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="font-display text-[15px] text-ink">
        <span className="tabular-nums">{bucket.hour.toString().padStart(2, "0")}:00</span>
        <span className="ml-2 text-ink-soft text-[13px]">{label}</span>
        {isNow && (
          <span className="ml-2 font-eyebrow text-[9px] uppercase tracking-[0.2em] text-aegean-deep">
            {t("pulse.hour.now")}
          </span>
        )}
      </p>
      {bucket.sampleCount > 0 && (
        <span className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {bucket.sampleCount.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-5 rounded-full" style={{ background: swatch }} />
      <span className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">{label}</span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Flow river (live 60-min ribbon)                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function FlowRiver({
  late,
  onTime,
  early,
  observations,
  median,
  t,
}: {
  late: number;
  onTime: number;
  early: number;
  observations: number;
  median: number;
  t: T;
}) {
  const total = late + onTime + early;
  const hasData = observations > 0 && total > 0;
  const medianMin = Math.round(median / 60);
  return (
    <div className="rounded-[28px] bg-card ring-1 ring-line p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {t("pulse.flow.kicker")}
          </p>
          <h2 className="mt-1 font-display text-[20px] leading-tight text-ink">
            {t("pulse.flow.title")}
          </h2>
        </div>
        {hasData && (
          <div className="text-right shrink-0">
            <p className="font-sans font-medium text-[18px] leading-none text-ink tabular-nums">
              {medianMin > 0 ? "+" : ""}
              {medianMin}
              <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
                {t("pulse.min")}
              </span>
            </p>
            <p className="mt-1 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
              {t("pulse.flow.median")}
            </p>
          </div>
        )}
      </div>

      {hasData ? (
        <>
          {/* SVG river — three flowing streams */}
          <RiverSVG late={late} onTime={onTime} early={early} />

          <div className="mt-4 grid grid-cols-3 gap-2">
            <FlowLeg color="ochre" label={t("pulse.flow.late")} pct={late} />
            <FlowLeg color="aegean-deep" label={t("pulse.flow.onTime")} pct={onTime} />
            <FlowLeg color="olive" label={t("pulse.flow.early")} pct={early} />
          </div>

          <p className="mt-4 font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
            {t("pulse.flow.observations", { n: observations.toLocaleString() })}
          </p>
        </>
      ) : (
        <p className="mt-5 text-[13px] text-ink-soft">{t("pulse.flow.empty")}</p>
      )}
    </div>
  );
}

function RiverSVG({ late, onTime, early }: { late: number; onTime: number; early: number }) {
  // Three horizontal flowing bands; height encodes share.
  const W = 320;
  const H = 64;
  const total = Math.max(1, late + onTime + early);
  const lateH = (late / total) * H;
  const onH = (onTime / total) * H;
  const earlyH = (early / total) * H;
  // Path generator: gentle sine wave across width
  const wave = (yMid: number, amp: number, phase: number) => {
    const steps = 16;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const y = yMid + Math.sin(i / steps * Math.PI * 2 + phase) * amp;
      pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(2)}`);
    }
    return pts.join(" ");
  };
  const stack = [
    { h: lateH, color: "var(--color-ochre)", label: "late" },
    { h: onH, color: "var(--color-aegean-deep)", label: "on" },
    { h: earlyH, color: "var(--color-olive)", label: "early" },
  ];
  let y = 0;
  return (
    <div className="mt-5 overflow-hidden rounded-2xl bg-limestone-soft">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full h-16">
        {stack.map((s, i) => {
          const top = y;
          const bottom = y + s.h;
          y = bottom;
          if (s.h <= 0.5) return null;
          // Build a flowing band between top wave and bottom wave
          const topPath = wave(top + s.h / 2 - s.h / 2 + 1, Math.min(2.2, s.h / 5), i * 1.7);
          const botPath = wave(bottom - 1, Math.min(2.2, s.h / 5), i * 1.7 + Math.PI);
          // Compose closed polygon
          const reverseLine = botPath.replace(/M/g, "L");
          const d = `${topPath} L${W} ${bottom} ${reverseLine} L0 ${top} Z`;
          return (
            <path
              key={s.label}
              d={d}
              fill={s.color}
              style={{ transition: "d 700ms cubic-bezier(0.32,0.72,0,1)" }}
            />
          );
        })}
      </svg>
    </div>
  );
}

function FlowLeg({ color, label, pct }: { color: "ochre" | "aegean-deep" | "olive"; label: string; pct: number }) {
  const text =
    color === "ochre"
      ? "text-ochre"
      : color === "olive"
      ? "text-olive"
      : "text-aegean-deep";
  return (
    <div className="flex flex-col gap-1">
      <span className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </span>
      <span className={`font-sans font-medium text-[22px] leading-none tabular-nums tracking-[-0.02em] ${text}`}>
        {pct}
        <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          %
        </span>
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Insight chips                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

type Insight = { text: string; tone: "ochre" | "olive" | "aegean" };

function buildInsights(
  data: { hottest: PulseRouteStat[]; coldest: PulseRouteStat[]; steadiest: PulseRouteStat[] } | undefined,
  delta: number | null,
  t: T,
): Insight[] {
  if (!data) return [];
  const out: Insight[] = [];
  // 1. Network mood vs typical
  if (delta != null) {
    if (delta >= 4) out.push({ text: t("pulse.insight.calmer"), tone: "olive" });
    else if (delta <= -4) {
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date());
      out.push({ text: t("pulse.insight.busier", { weekday }), tone: "ochre" });
    }
  }
  // 2. Worst route
  const worst = data.hottest[0];
  if (worst) {
    const route = getRoute(worst.routeId);
    out.push({
      text: t("pulse.insight.worstRoute", {
        code: route?.short ?? worst.routeId,
        min: Math.max(1, Math.round(worst.meanDelaySec / 60)),
      }),
      tone: "ochre",
    });
  }
  // 3. Earliest route OR steadiest fallback
  const earliest = data.coldest[0];
  if (earliest && Math.abs(earliest.meanDelaySec) >= 60) {
    const route = getRoute(earliest.routeId);
    out.push({
      text: t("pulse.insight.earlyRoute", {
        code: route?.short ?? earliest.routeId,
        min: Math.max(1, Math.round(Math.abs(earliest.meanDelaySec) / 60)),
      }),
      tone: "olive",
    });
  } else {
    const steady = data.steadiest[0];
    if (steady) {
      const route = getRoute(steady.routeId);
      out.push({
        text: t("pulse.insight.steadyRoute", { code: route?.short ?? steady.routeId }),
        tone: "aegean",
      });
    }
  }
  return out.slice(0, 3);
}

function InsightLine({ tone, children }: { tone: "ochre" | "olive" | "aegean"; children: React.ReactNode }) {
  const bar =
    tone === "ochre" ? "bg-ochre" : tone === "olive" ? "bg-olive" : "bg-aegean-deep";
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-card ring-1 ring-line px-4 py-3">
      <span className={`mt-1 h-5 w-[3px] rounded-full shrink-0 ${bar}`} />
      <p className="text-[13.5px] leading-snug text-ink">{children}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Route dot-strip — every learned route on a single diverging axis            */
/* ────────────────────────────────────────────────────────────────────────── */

type Filter = "all" | "late" | "early" | "steady";

function RouteDotStrip({ rows, t }: { rows: PulseRouteStat[]; t: T }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "late":
        return rows.filter((r) => r.meanDelaySec > 30).sort((a, b) => b.meanDelaySec - a.meanDelaySec);
      case "early":
        return rows.filter((r) => r.meanDelaySec < -30).sort((a, b) => a.meanDelaySec - b.meanDelaySec);
      case "steady":
        return [...rows].sort((a, b) => Math.abs(a.meanDelaySec) - Math.abs(b.meanDelaySec));
      default:
        return [...rows].sort((a, b) => Math.abs(b.meanDelaySec) - Math.abs(a.meanDelaySec));
    }
  }, [rows, filter]);

  const maxAbs = Math.max(60, ...filtered.map((r) => Math.abs(r.meanDelaySec)));
  const maxSamples = Math.max(1, ...filtered.map((r) => r.sampleCount));

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {t("pulse.dotstrip.kicker")}
          </p>
          <h2 className="font-display text-2xl mt-1 text-ink">{t("pulse.dotstrip.title")}</h2>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
        {(["all", "late", "early", "steady"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 font-eyebrow text-[10px] uppercase tracking-[0.18em] transition-colors ${
              filter === f
                ? "bg-ink text-limestone"
                : "bg-card ring-1 ring-line text-ink-soft hover:text-ink"
            }`}
          >
            {t(`pulse.filter.${f}` as DictKey)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[26px] bg-card p-5 ring-1 ring-line text-[13px] text-ink-soft">
          {t("pulse.dotstrip.empty")}
        </div>
      ) : (
        <div className="rounded-[26px] bg-card ring-1 ring-line overflow-hidden">
          {/* Axis header */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
            <span>{t("pulse.dotstrip.axisEarly")}</span>
            <span>{t("pulse.dotstrip.axisOnTime")}</span>
            <span>{t("pulse.dotstrip.axisLate")}</span>
          </div>
          <ul className="divide-y divide-line">
            {filtered.map((r) => (
              <DotRow key={r.routeId} row={r} maxAbs={maxAbs} maxSamples={maxSamples} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DotRow({
  row,
  maxAbs,
  maxSamples,
}: {
  row: PulseRouteStat;
  maxAbs: number;
  maxSamples: number;
}) {
  const route = getRoute(row.routeId);
  const delayMin = Math.round(row.meanDelaySec / 60);
  // Position on -1..+1 axis
  const x = Math.max(-1, Math.min(1, row.meanDelaySec / maxAbs));
  const leftPct = 50 + x * 48; // keep within 2-98%
  // Dot size — confidence
  const sizeFactor = Math.sqrt(row.sampleCount / maxSamples); // 0..1
  const dotSize = 10 + Math.round(sizeFactor * 16); // 10..26 px
  const dotColor =
    row.meanDelaySec > 30
      ? "bg-ochre"
      : row.meanDelaySec < -30
      ? "bg-olive"
      : "bg-aegean-deep";
  const valueColor =
    row.meanDelaySec > 30
      ? "text-ochre"
      : row.meanDelaySec < -30
      ? "text-olive"
      : "text-aegean-deep";

  return (
    <li>
      <Link
        to="/route/$routeId"
        params={{ routeId: row.routeId }}
        className="block px-4 py-3 transition-colors hover:bg-limestone-soft active:bg-limestone-soft/80"
      >
        <div className="flex items-center gap-2.5">
          <RouteChip code={route?.short ?? "?"} tone={routeTone(row.routeId)} />
          <p className="font-display text-[14px] text-ink line-clamp-1 flex-1 min-w-0">
            {route?.long ?? row.routeId}
          </p>
          <span className={`font-sans font-medium tabular-nums tracking-[-0.02em] text-[18px] leading-none ${valueColor}`}>
            {delayMin > 0 ? "+" : ""}
            {delayMin}
            <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
              m
            </span>
          </span>
        </div>
        {/* Axis lane */}
        <div className="relative mt-2 ml-[44px] h-5">
          {/* Track */}
          <div className="absolute inset-y-1/2 left-0 right-0 h-px -translate-y-1/2 bg-line" />
          {/* Zero marker */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-ink/15" />
          {/* Dot */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full ${dotColor} ring-2 ring-card`}
            style={{
              left: `${leftPct}%`,
              width: dotSize,
              height: dotSize,
              transition: "left 600ms cubic-bezier(0.32,0.72,0,1)",
            }}
          />
        </div>
        {/* Confidence footer */}
        <p className="mt-1 ml-[44px] font-eyebrow text-[8.5px] uppercase tracking-[0.2em] text-ink-soft tabular-nums">
          {row.sampleCount.toLocaleString()} trips
        </p>
      </Link>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* How it works                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

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
    <section className="mt-10 px-6 animate-rise" style={{ animationDelay: "320ms" }}>
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
