// Wave 3 — Traffic alerts on the rider's plan.
//
// Editorial ribbon that surfaces only when the CyNAP incident feed shows
// something intersecting the plan (see traffic-alerts.functions.ts).
// Calm palette (ochre-lit for medium, aegean-deep for high) — never
// alarmist, never generic. If no alerts are relevant we render nothing.

import { useI18n } from "@/lib/i18n";
import type { ItineraryTrafficReport } from "@/lib/traffic-alerts.functions";

function freshnessLabel(observedAt: string, isEl: boolean): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(observedAt)) / 60_000));
  if (min < 1) return isEl ? "μόλις τώρα" : "just now";
  if (min < 60) return isEl ? `πριν ${min} λεπ.` : `${min} min ago`;
  const h = Math.floor(min / 60);
  return isEl ? `πριν ${h} ώ.` : `${h} h ago`;
}

function distanceLabel(m: number, isEl: boolean): string {
  if (m < 100) return isEl ? "στη διαδρομή" : "on your route";
  if (m < 950) return isEl ? `${m} μ. μακριά` : `${m} m away`;
  return isEl ? `${(m / 1000).toFixed(1)} χλμ. μακριά` : `${(m / 1000).toFixed(1)} km away`;
}

export function TrafficAlertsCard({
  report,
}: {
  report: ItineraryTrafficReport;
}) {
  const { t, lang } = useI18n();
  const isEl = lang === "el";

  const accent =
    report.highest === "high"
      ? "bg-aegean-deep text-white"
      : report.highest === "medium"
        ? "bg-ochre-sun text-ink"
        : "bg-olive/15 text-olive-deep";

  return (
    <article className="rounded-[24px] bg-card ring-1 ring-line p-4 flex flex-col gap-3 animate-rise">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep leading-tight">
            {t("traffic.eyebrow")}
          </p>
          <h3 className="font-display text-[17px] leading-tight text-ink">
            {report.alerts.length === 1
              ? t("traffic.headlineOne")
              : t("traffic.headlineMany", { n: report.alerts.length })}
          </h3>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] tabular-nums shrink-0 rounded-full px-2.5 py-1 ${accent}`}
        >
          {t(`traffic.sev.${report.highest}`)}
        </span>
      </header>

      <ol className="flex flex-col gap-2.5">
        {report.alerts.map((a, i) => {
          const num = String(i + 1).padStart(2, "0");
          return (
            <li
              key={a.id}
              className="grid grid-cols-[auto_1fr_auto] gap-3 items-start rounded-2xl bg-limestone-warm/60 ring-1 ring-line/60 px-3 py-2.5"
            >
              <span className="font-mono text-[10px] tabular-nums text-ink-soft tracking-[0.14em] pt-0.5">
                {num}
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft leading-tight mb-0.5">
                  {t(`traffic.kind.${a.kind}`)}
                  {a.road ? ` — ${a.road}` : ""}
                </p>
                <p className="font-sans text-[13.5px] leading-snug text-ink break-words">
                  {a.headline}
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] tabular-nums text-ink-soft shrink-0 pt-0.5">
                {distanceLabel(a.distanceFromPathM, isEl)}
              </span>
            </li>
          );
        })}
      </ol>

      <footer className="flex items-center justify-between gap-3 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("traffic.source")}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {t("traffic.updated", { when: freshnessLabel(report.observedAt, isEl) })}
        </span>
      </footer>
    </article>
  );
}
