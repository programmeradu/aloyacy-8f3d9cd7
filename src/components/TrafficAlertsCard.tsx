// Live road alerts on the rider's plan, in the shared Roam card layout
// (mobility/MobilityCard.tsx): icon tile row with a severity pill, headline,
// one row per alert, quiet footnote. Surfaces only when the CyNAP incident
// feed shows something intersecting the plan (traffic-alerts.functions.ts).
// Sentence case, no eyebrows, no middle dots, no em or en dashes.

import { useI18n } from "@/lib/i18n";
import type { ItineraryTrafficReport } from "@/lib/traffic-alerts.functions";
import { Icon } from "@/components/roam/Icon";

const MUTE = "text-[var(--r-mute,#6f6f6a)]";

function freshnessLabel(observedAt: string, isEl: boolean): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(observedAt)) / 60_000));
  if (min < 1) return isEl ? "μόλις τώρα" : "just now";
  if (min < 60) return isEl ? `πριν ${min} λεπτά` : `${min} min ago`;
  const h = Math.floor(min / 60);
  return isEl ? `πριν ${h} ώρες` : `${h} h ago`;
}

function distanceLabel(m: number, isEl: boolean): string {
  if (m < 100) return isEl ? "Στη διαδρομή" : "On your route";
  if (m < 950) return isEl ? `${m} μ μακριά` : `${m} m away`;
  return isEl ? `${(m / 1000).toFixed(1)} χλμ μακριά` : `${(m / 1000).toFixed(1)} km away`;
}

export function TrafficAlertsCard({ report }: { report: ItineraryTrafficReport }) {
  const { t, locale } = useI18n();
  const isEl = locale === "el";

  const tile =
    report.highest === "high"
      ? "bg-[#171717] text-white"
      : report.highest === "medium"
        ? "bg-[var(--r-y,#f6b83c)] text-[#171717]"
        : "bg-[var(--r-pill,#eeeeea)] text-[#171717]";

  return (
    <article className="r-mob animate-rise flex flex-col gap-3.5 rounded-[26px] bg-white px-[18px] pb-[18px] pt-4 text-[#171717]">
      <header className="flex min-w-0 items-center gap-3">
        <span
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] ${tile}`}
          aria-hidden
        >
          <Icon name="traffic-cone" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-5">{t("traffic.eyebrow")}</p>
          <p className={`text-[13px] leading-[18px] ${MUTE}`}>
            {t("traffic.updated", { when: freshnessLabel(report.observedAt, isEl) })}
          </p>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full bg-[var(--r-pill,#eeeeea)] px-2.5 text-[12px] font-medium">
          {t(`traffic.sev.${report.highest}`)}
        </span>
      </header>

      <h3 className="text-balance text-[21px] font-medium leading-[1.2] tracking-[-0.015em]">
        {report.alerts.length === 1
          ? t("traffic.headlineOne")
          : t("traffic.headlineMany", { n: report.alerts.length })}
      </h3>

      <ul className="flex flex-col">
        {report.alerts.map((a, i) => (
          <li
            key={a.id}
            className={`flex min-w-0 flex-col gap-0.5 py-2.5 ${
              i > 0 ? "border-t border-[var(--r-line,#e7e7e3)]" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[14px] font-medium leading-5">
                {t(`traffic.kind.${a.kind}`)}
                {a.road ? `, ${a.road}` : ""}
              </p>
              <span className={`shrink-0 whitespace-nowrap text-[12px] ${MUTE} [font-variant-numeric:tabular-nums]`}>
                {distanceLabel(a.distanceFromPathM, isEl)}
              </span>
            </div>
            <p className={`break-words text-[13px] leading-[1.35] ${MUTE}`}>{a.headline}</p>
          </li>
        ))}
      </ul>

      <p className={`text-[12px] leading-4 ${MUTE}`}>{t("traffic.source")}</p>
    </article>
  );
}
