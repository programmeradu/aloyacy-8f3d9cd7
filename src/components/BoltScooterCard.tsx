// Wave 3 — Bolt e-scooter suggestion card (Nicosia).
//
// Surfaces a "scoot it" alternative when both endpoints sit inside the
// Nicosia coverage area and within a short walk of a mandated parking
// zone. We never claim live scooter counts — that's only in the Bolt app,
// and pretending otherwise would break trust the first time a rider
// walks 250 m to an empty zone. Instead we sell the legal viability:
// you can legally start here, you can legally park there, here's the
// honest time estimate, tap to confirm in the app.

import { useI18n } from "@/lib/i18n";
import type { BoltScooterSuggestion } from "@/lib/bolt-scooter.functions";

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

  const eyebrow =
    suggestion.reason === "faster"
      ? t("bolt.eyebrowFaster", { m: savingsMin })
      : t("bolt.eyebrowAlt");

  return (
    <article className="rounded-[28px] bg-card ring-1 ring-line p-5 flex flex-col gap-4 animate-rise">
      <header className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ochre-deep">
          {eyebrow}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {t("bolt.totalLine", { m: totalMin })}
        </p>
      </header>

      <h3 className="font-display text-[22px] leading-[1.15] text-ink text-balance">
        {t("bolt.title")}
      </h3>

      <ol className="flex flex-col gap-2.5">
        <li className="rounded-2xl bg-limestone-soft/60 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums">
            01
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {suggestion.pickup.name}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
              {t("bolt.pickupMeta", {
                walk: fmtWalk(suggestion.pickup.distanceM),
                slots: suggestion.pickup.capacity,
              })}
            </p>
          </div>
        </li>
        <li className="rounded-2xl bg-aegean-soft/40 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums">
            02
          </span>
          <div className="flex-1">
            <p className="font-display text-[15px] leading-tight text-ink">
              {t("bolt.rideLine", {
                m: rideMin,
                km: (suggestion.rideMeters / 1000).toFixed(1),
              })}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
              {t("bolt.ridePace")}
            </p>
          </div>
        </li>
        <li className="rounded-2xl bg-limestone-soft/60 p-3.5 flex items-start gap-3">
          <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums">
            03
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {suggestion.dropoff.name}
            </p>
            <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
              {t("bolt.dropoffMeta", {
                walk: fmtWalk(suggestion.dropoff.distanceM),
                slots: suggestion.dropoff.capacity,
              })}
            </p>
          </div>
        </li>
      </ol>

      <div className="flex flex-wrap gap-2">
        <a
          href={suggestion.appDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-ink px-4 py-2.5 font-sans text-[13px] font-semibold text-limestone transition-colors hover:bg-ochre-deep"
        >
          {t("bolt.openBolt")}
        </a>
        <a
          href={suggestion.mapsDeepLink}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-card ring-1 ring-line px-4 py-2.5 font-sans text-[13px] font-semibold text-ink transition-colors hover:ring-ochre/40"
        >
          {t("bolt.openRoute")}
        </a>
      </div>

      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/70">
        {t("bolt.disclaimer")}
      </p>
    </article>
  );
}
