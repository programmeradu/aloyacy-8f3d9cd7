// Wave 3 — Last-mile chain card.
//
// Surfaces a taxi / rideshare handoff when the bus drops the rider far
// from the destination, or when they'd be walking through a sleeping
// Cyprus town after 21:00. Editorial tone, numerals over icons, no
// bullet dots.

import { useI18n } from "@/lib/i18n";
import type { LastMileChainSuggestion } from "@/lib/last-mile-chain.functions";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtKm(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km`;
}

function fmtEur(n: number): string {
  return n >= 10 ? `€${Math.round(n)}` : `€${n.toFixed(1).replace(/\.0$/, "")}`;
}

export function LastMileChainCard({
  suggestion,
}: {
  suggestion: LastMileChainSuggestion;
}) {
  const { t } = useI18n();

  const driveMin = fmtMin(suggestion.drivingSec);
  const walkMin = fmtMin(suggestion.walkSec);
  const dist = fmtKm(suggestion.distanceMeters);
  const fare = `${fmtEur(suggestion.fareLow)}–${fmtEur(suggestion.fareHigh)}`;

  const eyebrow =
    suggestion.trigger === "long-late"
      ? t("chain.eyebrowLongLate")
      : suggestion.trigger === "late-night"
        ? t("chain.eyebrowLateNight")
        : t("chain.eyebrowLongWalk");

  const headline =
    suggestion.trigger === "long-late" || suggestion.trigger === "late-night"
      ? t("chain.titleAfterHours", { name: suggestion.toName || t("chain.toFallback") })
      : t("chain.titleLongWalk", { name: suggestion.toName || t("chain.toFallback") });

  const tariffNote = suggestion.isNightRate
    ? t("chain.tariffNight")
    : t("chain.tariffDay");

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line p-5 flex flex-col gap-4 animate-rise">
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ochre-deep">
          {eyebrow}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {t("chain.vsWalk", { m: walkMin })}
        </p>
      </header>

      <h3 className="font-display text-[22px] leading-[1.15] text-ink text-balance">
        {headline}
      </h3>

      {suggestion.fromName && (
        <p className="-mt-2 text-[13px] text-ink-soft leading-relaxed">
          {t("chain.fromLine", { name: suggestion.fromName })}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-limestone-soft/60 p-3">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink-soft">
            {t("chain.driveLabel")}
          </dt>
          <dd className="mt-1 font-display text-[26px] leading-none text-ink tabular-nums">
            {driveMin}
            <span className="ml-1 font-sans text-[12px] font-medium text-ink-soft">
              {t("common.minUnit")}
            </span>
          </dd>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {t("chain.driveSub")}
          </p>
        </div>
        <div className="rounded-2xl bg-aegean-soft/40 p-3">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep">
            {t("chain.distanceLabel")}
          </dt>
          <dd className="mt-1 font-display text-[26px] leading-none text-ink tabular-nums">
            {dist}
          </dd>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {t("chain.distanceSub")}
          </p>
        </div>
        <div className="rounded-2xl bg-ochre-soft/60 p-3">
          <dt className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ochre-deep">
            {t("chain.fareLabel")}
          </dt>
          <dd className="mt-1 font-display text-[22px] leading-none text-ink tabular-nums">
            {fare}
          </dd>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
            {tariffNote}
          </p>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <a
          href={suggestion.boltDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ink px-4 py-2.5 font-sans text-[13px] font-semibold text-limestone transition-colors hover:bg-aegean-deep"
        >
          {t("chain.openBolt")}
        </a>
        <a
          href={`tel:${suggestion.telDispatcher}`}
          className="rounded-full bg-card ring-1 ring-line px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-colors hover:ring-aegean/40"
        >
          {t("chain.callDispatcher")}
        </a>
        <a
          href={suggestion.mapsDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-card ring-1 ring-line px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-colors hover:ring-aegean/40"
        >
          {t("chain.openMaps")}
        </a>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
        {t("chain.disclaimer")}
      </p>
    </article>
  );
}
