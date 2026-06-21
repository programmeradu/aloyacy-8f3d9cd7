// Wave 3 — Kapnos Airport Shuttle suggestion card.
//
// Compact, expandable layout. Branded with the operator's own mark so
// riders recognise the service immediately. When the coach stop isn't a
// reasonable walk, we plan the city-bus first/last mile for them instead
// of telling them to "take a city bus or taxi".

import { useI18n } from "@/lib/i18n";
import type { KapnosSuggestion } from "@/lib/kapnos.functions";
import type { Itinerary, RideLeg, WalkLeg } from "@/lib/itinerary-types";
import kapnosLogo from "@/assets/kapnos-logo.png.asset.json";

const WALKABLE_M = 1_200;

function fmtWalk(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtTime(s: string): string {
  return (s.split(" ")[1] ?? "").slice(0, 5);
}

function fmtMin(sec: number): number {
  return Math.max(1, Math.round(sec / 60));
}

function fmtDateChip(s: string, locale: string): string {
  const [date] = s.split(" ");
  const [Y, M, D] = date.split("-").map((n) => parseInt(n, 10));
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (today === date) return "";
  const [tY, tM, tD] = today.split("-").map((n) => parseInt(n, 10));
  const diffDays = Math.round(
    (Date.UTC(Y, M - 1, D) - Date.UTC(tY, tM - 1, tD)) / 86_400_000,
  );
  if (diffDays === 1) return locale === "el" ? "αύριο" : "tomorrow";
  return new Intl.DateTimeFormat(locale === "el" ? "el-CY" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(Y, M - 1, D)));
}

/** Strip "(CO1) " / "(A01) " stop-code prefixes for tighter display. */
function shortStop(name: string): string {
  return name.replace(/^\([A-Z0-9]+\)\s*/i, "").trim();
}

/** Convert the route name "NICOSIA > LARNACA" → "Nicosia → Larnaca". */
function prettyRoute(name: string): string {
  return name
    .split(/\s*>\s*/)
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(" → ");
}

function MiniItinerary({ itin }: { itin: Itinerary }) {
  const rides = itin.legs.filter((l): l is RideLeg => l.kind === "ride");
  const totalMin = fmtMin(itin.totalDurationSec);
  const walkM = Math.round(itin.totalWalkMeters);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {rides.map((r, i) => (
          <span
            key={`${r.tripId}-${i}`}
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-aegean-deep tabular-nums"
          >
            {r.routeShort}
            {i < rides.length - 1 ? (
              <span className="ml-2 text-ink-soft">→</span>
            ) : null}
          </span>
        ))}
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft tabular-nums">
          · {totalMin} min · {fmtWalk(walkM)}
        </span>
      </div>
      <p className="font-sans text-[12px] leading-snug text-ink-soft">
        {rides.length > 0
          ? `${shortStop(rides[0].board.name)} → ${shortStop(
              rides[rides.length - 1].alight.name,
            )}`
          : (() => {
              const w = itin.legs.find((l): l is WalkLeg => l.kind === "walk");
              return w ? `${shortStop(w.from.name)} → ${shortStop(w.to.name)}` : "";
            })()}
      </p>
    </div>
  );
}

export function KapnosShuttleCard({
  suggestion,
  firstMile,
  lastMile,
  firstMileLoading,
  lastMileLoading,
  onPlanFirstMile,
  onPlanLastMile,
}: {
  suggestion: KapnosSuggestion;
  firstMile?: Itinerary | null;
  lastMile?: Itinerary | null;
  firstMileLoading?: boolean;
  lastMileLoading?: boolean;
  onPlanFirstMile?: () => void;
  onPlanLastMile?: () => void;
}) {
  const { t, locale } = useI18n();
  const rideMin = fmtMin(suggestion.rideSec);
  const next = suggestion.departures[0];
  const nextDepart = fmtTime(next.departLocal);
  const nextArrive = fmtTime(next.arriveLocal);
  const dayChip = fmtDateChip(next.departLocal, locale);

  const pickupFar = suggestion.pickup.distanceM > WALKABLE_M;
  const dropoffFar = suggestion.dropoff.distanceM > WALKABLE_M;

  return (
    <article className="rounded-[24px] bg-card ring-1 ring-line p-4 flex flex-col gap-3 animate-rise">
      {/* Header: operator logo + route code */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={kapnosLogo.url}
            alt="Kapnos Airport Shuttle"
            className="h-7 w-7 rounded-md object-contain bg-white ring-1 ring-line/60 p-0.5"
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep leading-tight">
              {t("kapnos.eyebrow")}
            </p>
            <p className="font-display text-[15px] leading-tight text-ink truncate">
              {prettyRoute(suggestion.routeName)}
            </p>
          </div>
        </div>
      </header>

      {/* Headline summary line — next coach, condensed */}
      <div className="rounded-2xl bg-aegean-soft/40 px-3.5 py-2.5 flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-display text-[18px] text-ink tabular-nums">
            {nextDepart}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
            →
          </span>
          <span className="font-display text-[18px] text-ink tabular-nums">
            {nextArrive}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
            {rideMin} min
          </span>
          {dayChip ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ochre-deep">
              {dayChip}
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
          {t("kapnos.fromPrice", { price: next.priceFrom })}
        </span>
      </div>

      {/* Compact 3-step rail: pickup · ride · dropoff */}
      <ol className="flex flex-col gap-1.5">
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums shrink-0 w-5">
            01
          </span>
          <span className="font-sans text-[13px] text-ink truncate flex-1">
            {shortStop(suggestion.pickup.name)}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums shrink-0">
            {fmtWalk(suggestion.pickup.distanceM)}
          </span>
        </li>
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-aegean-deep tabular-nums shrink-0 w-5">
            02
          </span>
          <span className="font-sans text-[13px] text-ink-soft truncate flex-1">
            {t("kapnos.coachLeg", { m: rideMin })}
          </span>
        </li>
        <li className="flex items-baseline gap-2.5 min-w-0">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ochre-deep tabular-nums shrink-0 w-5">
            03
          </span>
          <span className="font-sans text-[13px] text-ink truncate flex-1">
            {shortStop(suggestion.dropoff.name)}
          </span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft tabular-nums shrink-0">
            {fmtWalk(suggestion.dropoff.distanceM)}
          </span>
        </li>
      </ol>

      {/* First-mile plan: only when the rider isn't already at the coach stop */}
      {pickupFar ? (
        <details className="group rounded-2xl ring-1 ring-line/60 px-3.5 py-2.5 [&[open]>summary>span.chev]:rotate-180">
          <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
              {t("kapnos.firstMile.title", {
                stop: shortStop(suggestion.pickup.name),
              })}
            </span>
            <span className="chev font-mono text-[10px] text-ink-soft transition-transform">
              ▾
            </span>
          </summary>
          <div className="mt-2.5">
            {firstMileLoading ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                {t("kapnos.firstMile.loading")}
              </p>
            ) : firstMile ? (
              <MiniItinerary itin={firstMile} />
            ) : (
              <p className="font-sans text-[12px] text-ink-soft leading-snug">
                {t("kapnos.firstMile.none")}
              </p>
            )}
          </div>
        </details>
      ) : null}

      {/* Last-mile plan from airport-side coach stop */}
      {dropoffFar ? (
        <details className="group rounded-2xl ring-1 ring-line/60 px-3.5 py-2.5 [&[open]>summary>span.chev]:rotate-180">
          <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
              {t("kapnos.lastMile.title", {
                stop: shortStop(suggestion.dropoff.name),
              })}
            </span>
            <span className="chev font-mono text-[10px] text-ink-soft transition-transform">
              ▾
            </span>
          </summary>
          <div className="mt-2.5">
            {lastMileLoading ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                {t("kapnos.lastMile.loading")}
              </p>
            ) : lastMile ? (
              <MiniItinerary itin={lastMile} />
            ) : (
              <p className="font-sans text-[12px] text-ink-soft leading-snug">
                {t("kapnos.lastMile.none")}
              </p>
            )}
          </div>
        </details>
      ) : null}

      {/* Collapsed: full timetable + book CTAs + disclaimer */}
      <details className="group [&[open]>summary>span.chev]:rotate-180">
        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none rounded-2xl bg-limestone-soft/60 px-3.5 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
            {t("kapnos.moreLabel")}
          </span>
          <span className="chev font-mono text-[10px] text-ink-soft transition-transform">
            ▾
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <ul className="flex flex-col rounded-2xl ring-1 ring-line/60 divide-y divide-line/40">
            {suggestion.departures.map((d) => {
              const chip = fmtDateChip(d.departLocal, locale);
              const seatsLow = d.seatsAvailable > 0 && d.seatsAvailable <= 8;
              const sold = d.seatsAvailable <= 0;
              return (
                <li
                  key={d.tripId}
                  className="flex items-baseline justify-between gap-3 px-3 py-2"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-display text-[14px] text-ink tabular-nums">
                      {fmtTime(d.departLocal)}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-soft tabular-nums">
                      {t("kapnos.arrivesAt", { time: fmtTime(d.arriveLocal) })}
                    </span>
                    {chip ? (
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ochre-deep">
                        {chip}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={`font-mono text-[9.5px] uppercase tracking-[0.18em] tabular-nums ${
                      sold
                        ? "text-red-700"
                        : seatsLow
                          ? "text-ochre-deep"
                          : "text-ink-soft"
                    }`}
                  >
                    {sold
                      ? t("kapnos.soldOut")
                      : t("kapnos.seatsLeft", { n: d.seatsAvailable })}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <a
              href={suggestion.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-ink px-4 py-2 font-sans text-[12.5px] font-semibold text-limestone transition-colors hover:bg-ochre-deep"
            >
              {t("kapnos.bookCta")}
            </a>
            <a
              href={suggestion.routeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-card ring-1 ring-line px-4 py-2 font-sans text-[12.5px] font-semibold text-ink transition-colors hover:ring-aegean/40"
            >
              {t("kapnos.timetableCta")}
            </a>
          </div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-soft/70">
            {t("kapnos.disclaimer")}
          </p>
        </div>
      </details>
    </article>
  );
}
