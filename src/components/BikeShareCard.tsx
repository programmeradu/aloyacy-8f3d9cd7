// Wave 3 — Nextbike bike-share suggestion card.
//
// Compact, branded, expandable layout that mirrors the Kapnos shuttle and
// Bolt scooter cards. Operator logo + door-to-door total in the header,
// ride headline + optional savings chip, a numbered 01/02/03 rail with
// pickup/ride/dropoff, and a collapsed "Ride details" section that hides
// the maps deep-link and the live-availability disclaimer.

import { useI18n } from "@/lib/i18n";
import type { BikeShareSuggestion } from "@/lib/bikeshare.functions";
import nextbikeLogo from "@/assets/nextbike-logo.svg.asset.json";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function BikeShareCard({
  suggestion,
}: {
  suggestion: BikeShareSuggestion;
}) {
  const { t } = useI18n();
  const rideMin = fmtMin(suggestion.rideSec);
  const totalMin = fmtMin(suggestion.totalSec);
  const savingsMin = fmtMin(suggestion.savingsSec);
  const rideKm = (suggestion.rideMeters / 1000).toFixed(1);

  const showSavings = suggestion.reason === "faster" && savingsMin >= 1;

  return (
    <article className="rounded-[24px] bg-card ring-1 ring-line p-4 flex flex-col gap-3 animate-rise">
      {/* Header: operator logo + eyebrow + door-to-door total */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={nextbikeLogo.url}
            alt="Nextbike"
            className="h-7 w-7 rounded-md object-contain bg-white ring-1 ring-line/60 p-0.5"
            loading="lazy"
            width={28}
            height={28}
          />
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep leading-tight">
              {t("bike.eyebrow")}
            </p>
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {t("bike.subhead", { city: suggestion.cityName })}
            </p>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums shrink-0">
          {t("bike.totalLine", { m: totalMin })}
        </span>
      </header>

      {/* Headline summary — ride length + optional savings chip */}
      <div className="rounded-2xl bg-aegean-soft/40 px-3.5 py-2.5 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-[18px] text-ink tabular-nums">
            {rideMin} min
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
            {rideKm} km
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            {t("bike.ridePace")}
          </span>
        </div>
        {showSavings ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep tabular-nums">
            {t("bike.savesLine", { m: savingsMin })}
          </span>
        ) : null}
      </div>

      {/* Compact 3-step rail */}
      <ol className="flex flex-col gap-1.5">
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums shrink-0 w-5">
            01
          </span>
          <span className="font-sans text-[13px] text-ink truncate flex-1">
            {suggestion.pickup.name}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums shrink-0">
            {fmtWalk(suggestion.pickup.distanceM)} · {suggestion.pickup.bikes} {t("bike.bikesShort")}
          </span>
        </li>
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums shrink-0 w-5">
            02
          </span>
          <span className="font-sans text-[13px] text-ink-soft truncate flex-1">
            {t("bike.rideLeg", { m: rideMin, km: rideKm })}
          </span>
        </li>
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums shrink-0 w-5">
            03
          </span>
          <span className="font-sans text-[13px] text-ink truncate flex-1">
            {suggestion.dropoff.name}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums shrink-0">
            {fmtWalk(suggestion.dropoff.distanceM)} · {suggestion.dropoff.freeRacks} {t("bike.racksShort")}
          </span>
        </li>
      </ol>

      {/* Primary CTA always visible */}
      <a
        href={suggestion.webDeepLink}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start rounded-full bg-ink px-4 py-2 font-sans text-[12.5px] font-semibold text-limestone transition-colors hover:bg-aegean-deep"
      >
        {t("bike.openNextbike")}
      </a>

      {/* Collapsed: maps deep-link + legal lines + disclaimer */}
      <details className="group [&[open]>summary>span.chev]:rotate-180">
        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none rounded-2xl bg-limestone-soft/60 px-3.5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
            {t("bike.moreLabel")}
          </span>
          <span className="chev font-mono text-[10px] text-ink-soft transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5">
            <li className="font-sans text-[12px] leading-snug text-ink-soft">
              {t("bike.pickupMeta", {
                bikes: suggestion.pickup.bikes,
                walk: fmtWalk(suggestion.pickup.distanceM),
              })}
            </li>
            <li className="font-sans text-[12px] leading-snug text-ink-soft">
              {t("bike.dropoffMeta", {
                racks: suggestion.dropoff.freeRacks,
                walk: fmtWalk(suggestion.dropoff.distanceM),
              })}
            </li>
          </ul>
          <a
            href={suggestion.mapsDeepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-full bg-card ring-1 ring-line px-4 py-2 font-sans text-[12.5px] font-semibold text-ink transition-colors hover:ring-aegean/40"
          >
            {t("bike.openRoute")}
          </a>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-soft/70">
            {t("bike.disclaimer")}
          </p>
        </div>
      </details>
    </article>
  );
}
