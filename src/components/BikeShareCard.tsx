// Wave 3 — Nextbike bike-share suggestion card.
//
// Surfaces a "cycle instead" alternative when both trip endpoints have a
// docked bike with a guaranteed free rack on the other side. Editorial
// density: live station name, real-time bike count, ride time, savings.

import { useI18n } from "@/lib/i18n";
import type { BikeShareSuggestion } from "@/lib/bikeshare.functions";

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

  const eyebrow =
    suggestion.reason === "faster"
      ? t("bike.eyebrowFaster", { m: savingsMin })
      : t("bike.eyebrowAlt");

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line p-5 flex flex-col gap-4 animate-rise">
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-aegean-deep">
          {eyebrow}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {t("bike.totalLine", { m: totalMin })}
        </p>
      </header>

      <h3 className="font-display text-[22px] leading-[1.15] text-ink text-balance">
        {t("bike.title", { city: suggestion.cityName })}
      </h3>

      <ol className="flex flex-col gap-2.5">
        <li className="rounded-2xl bg-aegean-soft/40 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums">
            01
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {suggestion.pickup.name}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
              {t("bike.pickupMeta", {
                bikes: suggestion.pickup.bikes,
                walk: fmtWalk(suggestion.pickup.distanceM),
              })}
            </p>
          </div>
        </li>
        <li className="rounded-2xl bg-limestone-soft/60 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums">
            02
          </span>
          <div className="flex-1">
            <p className="font-display text-[15px] leading-tight text-ink">
              {t("bike.rideLine", {
                m: rideMin,
                km: (suggestion.rideMeters / 1000).toFixed(1),
              })}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
              {t("bike.ridePace")}
            </p>
          </div>
        </li>
        <li className="rounded-2xl bg-aegean-soft/40 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums">
            03
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {suggestion.dropoff.name}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
              {t("bike.dropoffMeta", {
                racks: suggestion.dropoff.freeRacks,
                walk: fmtWalk(suggestion.dropoff.distanceM),
              })}
            </p>
          </div>
        </li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <a
          href={suggestion.webDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ink px-4 py-2.5 font-sans text-[13px] font-semibold text-limestone transition-colors hover:bg-aegean-deep"
        >
          {t("bike.openNextbike")}
        </a>
        <a
          href={suggestion.mapsDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-card ring-1 ring-line px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-colors hover:ring-aegean/40"
        >
          {t("bike.openRoute")}
        </a>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
        {t("bike.disclaimer")}
      </p>
    </article>
  );
}
