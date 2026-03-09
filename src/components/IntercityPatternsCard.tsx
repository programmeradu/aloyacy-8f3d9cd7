// Wave 3 — Cross-island intercity intelligence card.
//
// Rendered on /route/$routeId only when agency === "IC". Surfaces the
// weekend-vs-weekday split, the most reliable departure window, and any
// dow×hour anomalies we have enough data to call out. Stays silent when
// the route is still in "learning" mode (no fake confidence).

import { useI18n, type DictKey } from "@/lib/i18n";
import type {
  IntercityAnomaly,
  IntercityInsights,
  IntercityWindow,
} from "@/lib/intercity-intel.functions";

type TFn = (k: DictKey, p?: Record<string, string | number>) => string;

type Props = {
  insights: IntercityInsights | null | undefined;
  isLoading?: boolean;
};

// Postgres dow: 0=Sun … 6=Sat. We label using the i18n dictionary so the
// short forms render correctly in EL.
function dayKey(dow: number): string {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dow] ?? "mon";
}

function fmtHourBand(hour: number): string {
  // Whole-hour band, e.g. "17:00–18:00". Local time; the underlying buckets
  // are computed in the rider's timezone by the GTFS pipeline.
  const h = ((hour % 24) + 24) % 24;
  const next = (h + 1) % 24;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:00–${pad(next)}:00`;
}

function fmtDelay(sec: number, t: TFn) {
  const abs = Math.round(Math.abs(sec));
  if (abs < 30) return t("intercity.onTime");
  const m = Math.round(abs / 60);
  if (sec > 0) {
    return m >= 1 ? t("intercity.lateMin", { m }) : t("intercity.lateSec", { s: abs });
  }
  return m >= 1 ? t("intercity.earlyMin", { m }) : t("intercity.earlySec", { s: abs });
}

function WindowLine({
  label,
  window,
}: {
  label: string;
  window: IntercityWindow;
}) {
  const { t } = useI18n();
  const day = t(`day.short.${dayKey(window.dayOfWeek)}` as DictKey);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
        {label}
      </span>
      <span className="font-display text-[20px] leading-tight text-ink">
        {day} {fmtHourBand(window.hourOfDay)}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/80">
        {fmtDelay(window.meanDelaySec, t as TFn)} · {t("intercity.runs", { n: window.sampleCount })}
      </span>
    </div>
  );
}

function AnomalyRow({ anomaly }: { anomaly: IntercityAnomaly }) {
  const { t } = useI18n();
  const day = t(`day.long.${dayKey(anomaly.dayOfWeek)}` as DictKey);
  return (
    <li className="flex items-baseline justify-between gap-4 border-t border-line/60 pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] leading-snug text-ink">
          {t("intercity.anomalyHeadline", {
            day,
            band: fmtHourBand(anomaly.hourOfDay),
          })}
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("intercity.anomalyDelta", {
            delta: Math.max(1, Math.round(anomaly.deltaFromBaselineSec / 60)),
          })}
        </p>
      </div>
      <span className="shrink-0 font-display text-[18px] tabular-nums text-ochre">
        +{Math.max(1, Math.round(anomaly.deltaFromBaselineSec / 60))}′
      </span>
    </li>
  );
}

export function IntercityPatternsCard({ insights, isLoading }: Props) {
  const { t } = useI18n();

  if (isLoading) {
    return (
      <section className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("intercity.eyebrow")}
        </p>
        <p className="mt-3 font-display text-[18px] text-ink-soft">
          {t("intercity.loading")}
        </p>
      </section>
    );
  }

  if (!insights) return null;

  // Learning / unknown — say so honestly instead of inventing numbers.
  if (insights.tier !== "rated") {
    return (
      <section className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("intercity.eyebrow")}
        </p>
        <p className="mt-3 font-display text-[18px] leading-snug text-ink">
          {t("intercity.learning")}
        </p>
        <p className="mt-2 text-[13px] text-ink-soft">
          {t("intercity.learningSub", { n: insights.sampleCount })}
        </p>
      </section>
    );
  }

  const { weekdayMeanDelaySec, weekendMeanDelaySec, bestWindow, anomalies } = insights;
  const weekendDelta =
    weekdayMeanDelaySec !== null && weekendMeanDelaySec !== null
      ? weekendMeanDelaySec - weekdayMeanDelaySec
      : null;

  return (
    <section className="rounded-[24px] bg-limestone-soft ring-1 ring-line p-5 space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
          {t("intercity.eyebrow")}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/80">
          {t("intercity.samples", { n: insights.sampleCount })}
        </p>
      </div>

      {/* Weekday vs Weekend grid */}
      {(weekdayMeanDelaySec !== null || weekendMeanDelaySec !== null) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("intercity.weekday")}
            </span>
            <p className="mt-1.5 font-display text-[22px] leading-none text-ink">
              {weekdayMeanDelaySec === null ? "—" : fmtDelay(weekdayMeanDelaySec, t)}
            </p>
          </div>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              {t("intercity.weekend")}
            </span>
            <p className="mt-1.5 font-display text-[22px] leading-none text-ink">
              {weekendMeanDelaySec === null ? "—" : fmtDelay(weekendMeanDelaySec, t)}
            </p>
            {weekendDelta !== null && Math.abs(weekendDelta) >= 60 && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {weekendDelta > 0
                  ? t("intercity.weekendSlower", {
                      m: Math.max(1, Math.round(weekendDelta / 60)),
                    })
                  : t("intercity.weekendFaster", {
                      m: Math.max(1, Math.round(Math.abs(weekendDelta) / 60)),
                    })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Best window — calm signal, separated by hairline */}
      {bestWindow && (
        <div className="border-t border-line/60 pt-4">
          <WindowLine label={t("intercity.bestWindow")} window={bestWindow} />
        </div>
      )}

      {/* Anomalies — only when we have at least one */}
      {anomalies.length > 0 && (
        <div className="border-t border-line/60 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
            {t("intercity.anomaliesLabel")}
          </p>
          <ul className="mt-3 space-y-3">
            {anomalies.map((a) => (
              <AnomalyRow key={`${a.dayOfWeek}-${a.hourOfDay}`} anomaly={a} />
            ))}
          </ul>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/80">
            {t("intercity.anomaliesFootnote")}
          </p>
        </div>
      )}
    </section>
  );
}
