// "How the network is moving" — one tight card carrying the day's punctuality
// split, a plain-language read of the median, and the 24-hour activity comb.
// All the arithmetic lives in @aloya/core/pulse-flow so it can be tested.

import {
  combBars,
  flowSegments,
  flowSummary,
  hasActivity,
  type ActivityBucket,
} from "@aloya/core/pulse-flow";
import type { HourBucket } from "@/lib/pulse.functions";
import type { Translate } from "@/components/pulse/TodayEditorial";
import pulseNetworkBand from "@/assets/pulse-network-band.jpg";

export function RoadPulseCard({
  kicker,
  basis,
  onTimePct,
  latePct,
  earlyPct,
  observations,
  medianSec,
  buckets,
  nowHour,
  t,
}: {
  kicker?: string;
  basis?: string;
  onTimePct: number;
  latePct: number;
  earlyPct: number;
  observations: number;
  medianSec: number;
  buckets: HourBucket[];
  nowHour: number;
  t: Translate;
}) {
  const hasData = observations > 0;
  const summary = flowSummary(medianSec);
  const segments = flowSegments(latePct, onTimePct, earlyPct);
  const showComb = hasActivity(buckets);

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-card ring-1 ring-line">
      {/* Editorial illustration band — always visible, even when no live signal */}
      <div className="relative aspect-[16/7] w-full overflow-hidden">
        <img
          src={pulseNetworkBand}
          alt=""
          aria-hidden
          loading="lazy"
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover select-none"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-card) 40%, transparent) 55%, var(--color-card) 100%)",
          }}
        />
        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
          <div className="rounded-2xl bg-card/90 backdrop-blur-sm px-3 py-2">
            <p className="font-eyebrow text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {kicker ?? t("pulse.flow.kicker")}
            </p>
            <h2 className="mt-1 font-display text-[22px] leading-tight text-ink text-balance max-w-[17ch]">
              {t("pulse.flow.title")}
            </h2>
          </div>
          <div className="rounded-2xl bg-card/90 backdrop-blur-sm ring-1 ring-line px-3 py-2 text-right">
            <div className="flex items-baseline gap-1 justify-end">
              <span className="font-display text-[34px] leading-none text-aegean-deep tabular-nums tracking-[-0.02em]">
                {hasData ? onTimePct : "-"}
              </span>
              <span className="font-eyebrow text-[10px] uppercase tracking-[0.2em] text-ink-soft pb-1">
                %
              </span>
            </div>
            <p className="mt-1 font-eyebrow text-[9px] uppercase tracking-[0.2em] text-ink-soft">
              {t("pulse.flow.onTime")}
            </p>
          </div>
        </div>
      </div>

      <div className="relative px-6 pb-6 pt-1">
        {/* Proportion bar — late / on-time / early */}
        {hasData ? (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full">
              <span style={{ width: `${segments.late}%` }} className="bg-[#F2865E]" />
              <span style={{ width: `${segments.onTime}%` }} className="bg-[#F6B83C]" />
              <span style={{ width: `${segments.early}%` }} className="bg-[#C9C9C4]" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <PulseLeg color="ochre" label={t("pulse.flow.late")} pct={latePct} />
              <PulseLeg color="aegean" label={t("pulse.flow.onTime")} pct={onTimePct} />
              <PulseLeg color="olive" label={t("pulse.flow.early")} pct={earlyPct} />
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-limestone-soft ring-1 ring-line px-4 py-3">
            <p className="font-eyebrow text-[9.5px] uppercase tracking-[0.22em] text-ink-soft">
              {t("pulse.flow.empty")}
            </p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink">
              Buses are between runs. The network wakes back up at first morning departure.
            </p>
          </div>
        )}

        {/* Plain-language summary of what the numbers mean right now */}
        {hasData && (
          <p className="mt-4 text-[14px] leading-snug text-ink">
            {summary.kind === "late"
              ? t("pulse.flow.summaryLate", { n: summary.minutes })
              : summary.kind === "early"
                ? t("pulse.flow.summaryEarly", { n: summary.minutes })
                : t("pulse.flow.summaryOnTime")}
          </p>
        )}

        {/* Activity across the day — one simple visual, plain-English ticks */}
        {showComb && (
          <div className="mt-5">
            <p className="font-eyebrow text-[9px] uppercase tracking-[0.22em] text-ink-soft">
              {t("pulse.flow.activityTitle")}
            </p>
            <div className="mt-2">
              <ActivityComb buckets={buckets} nowHour={nowHour} />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
              <span>{t("pulse.flow.activityMorning")}</span>
              <span>{t("pulse.flow.activityMidday")}</span>
              <span>{t("pulse.flow.activityEvening")}</span>
              <span>{t("pulse.flow.activityLate")}</span>
            </div>
          </div>
        )}

        {hasData && (
          <p className="mt-4 text-[12px] leading-snug text-ink-soft">
            {basis ??
              (observations === 1
                ? t("pulse.flow.basedOnOne")
                : t("pulse.flow.basedOnMany", { n: observations.toLocaleString() }))}
          </p>
        )}
      </div>
    </article>
  );
}

function PulseLeg({
  color,
  label,
  pct,
}: {
  color: "ochre" | "aegean" | "olive";
  label: string;
  pct: number;
}) {
  const cls =
    color === "ochre" ? "text-[#C8542C]" : color === "olive" ? "text-ink-soft" : "text-ink";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
        {label}
      </span>
      <span
        className={`font-sans font-semibold text-[18px] leading-none tabular-nums tracking-[-0.02em] ${cls}`}
      >
        {pct}
        <span className="ml-0.5 font-eyebrow text-[9px] uppercase tracking-[0.18em] text-ink-soft">
          %
        </span>
      </span>
    </div>
  );
}

function ActivityComb({ buckets, nowHour }: { buckets: ActivityBucket[]; nowHour: number }) {
  const bars = combBars(buckets, nowHour);
  return (
    <div className="mt-2 flex h-7 items-end gap-[2px]" aria-hidden>
      {bars.map((bar) => (
        <span
          key={bar.hour}
          className={`flex-1 rounded-[2px] ${
            bar.isNow ? "bg-ink" : bar.isEmpty ? "bg-line" : "bg-aegean-deep/35"
          }`}
          style={{ height: `${bar.height}px` }}
        />
      ))}
    </div>
  );
}
