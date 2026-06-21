// Wave 3 — Bolt e-scooter suggestion card (Nicosia).
//
// Compact, expandable layout mirroring the Kapnos shuttle card. Branded
// with the Bolt mark so riders recognise the operator immediately. The
// pickup/dropoff zone, ride distance and savings stay above the fold;
// pace caveats, the maps deep-link and the live-availability disclaimer
// are tucked behind a "Ride details" expander to keep the planner page
// scannable.

import { useI18n } from "@/lib/i18n";
import type { BoltScooterSuggestion } from "@/lib/bolt-scooter.functions";
import boltLogo from "@/assets/bolt-logo.png.asset.json";

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function BoltScooterCard({
  suggestion,
}: {
  suggestion: BoltScooterSuggestion;
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
            src={boltLogo.url}
            alt="Bolt"
            className="h-7 w-7 rounded-md object-contain ring-1 ring-line/60"
            loading="lazy"
            width={28}
            height={28}
          />
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep leading-tight">
              {t("bolt.eyebrow")}
            </p>
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {t("bolt.subhead")}
            </p>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums shrink-0">
          {t("bolt.totalLine", { m: totalMin })}
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
            {t("bolt.ridePace")}
          </span>
        </div>
        {showSavings ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep tabular-nums">
            {t("bolt.savesLine", { m: savingsMin })}
          </span>
        ) : null}
      </div>

      {/* Compact 3-step rail: pickup zone · ride · dropoff zone */}
      <ol className="flex flex-col gap-1.5">
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums shrink-0 w-5">
            01
          </span>
          <span className="font-sans text-[13px] text-ink truncate flex-1">
            {suggestion.pickup.name}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums shrink-0">
            {fmtWalk(suggestion.pickup.distanceM)} · {suggestion.pickup.capacity}
          </span>
        </li>
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums shrink-0 w-5">
            02
          </span>
          <span className="font-sans text-[13px] text-ink-soft truncate flex-1">
            {t("bolt.rideLeg", { m: rideMin, km: rideKm })}
          </span>
        </li>
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums shrink-0 w-5">
            03
          </span>
          <span className="font-sans text-[13px] text-ink truncate flex-1">
            {suggestion.dropoff.name}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums shrink-0">
            {fmtWalk(suggestion.dropoff.distanceM)} · {suggestion.dropoff.capacity}
          </span>
        </li>
      </ol>

      {/* Primary CTA always visible */}
      <a
        href={suggestion.appDeepLink}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start rounded-full bg-ink px-4 py-2 font-sans text-[12.5px] font-semibold text-limestone transition-colors hover:bg-ochre-deep"
      >
        {t("bolt.openBolt")}
      </a>

      {/* Collapsed: maps deep-link + disclaimer */}
      <details className="group [&[open]>summary>span.chev]:rotate-180">
        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none rounded-2xl bg-limestone-soft/60 px-3.5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
            {t("bolt.moreLabel")}
          </span>
          <span className="chev font-mono text-[10px] text-ink-soft transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <ul className="flex flex-col gap-1.5">
            <li className="font-sans text-[12px] leading-snug text-ink-soft">
              {t("bolt.legalPickup", {
                walk: fmtWalk(suggestion.pickup.distanceM),
                slots: suggestion.pickup.capacity,
              })}
            </li>
            <li className="font-sans text-[12px] leading-snug text-ink-soft">
              {t("bolt.legalDropoff", {
                walk: fmtWalk(suggestion.dropoff.distanceM),
                slots: suggestion.dropoff.capacity,
              })}
            </li>
          </ul>
          <a
            href={suggestion.mapsDeepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start rounded-full bg-card ring-1 ring-line px-4 py-2 font-sans text-[12.5px] font-semibold text-ink transition-colors hover:ring-aegean/40"
          >
            {t("bolt.openRoute")}
          </a>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-soft/70">
            {t("bolt.disclaimer")}
          </p>
        </div>
      </details>
    </article>
  );
}
