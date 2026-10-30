// Roam departure row for the stop sheet: line pill, headsign, scheduled
// clock and band, and on the right the minutes with the confidence mark and
// its word. The rider hints (pay, wait or bail, headway, no-show) sit under
// the row as one clipped secondary line that expands on tap, so rows stay
// two lines like the concept and no hint is lost.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { FreshnessTier } from "@/lib/freshness";

export function RoamDepartureRow({
  tripId,
  stopId,
  routeShort,
  title,
  clock,
  band,
  etaMin,
  tier,
  tierLabel,
  opShift,
  first,
  scheduledLabel,
  hints,
  moreLabel,
}: {
  tripId: string;
  stopId: string;
  routeShort: string;
  title: string;
  clock: string;
  band: string | null;
  etaMin: number | null;
  tier: FreshnessTier;
  tierLabel: string;
  opShift: string | null;
  first?: boolean;
  scheduledLabel: string;
  hints: ReactNode;
  moreLabel: string;
}) {
  const mark =
    tier === "live" || tier === "rider-confirmed" ? (
      <span className="r-dot" />
    ) : tier === "scheduled" ? (
      <span className="r-ring" />
    ) : (
      <span className="r-dot r-dot--grey" />
    );
  const showClock = etaMin == null || etaMin >= 60;
  return (
    <>
      <Link
        to="/trip-info/$tripId"
        params={{ tripId }}
        search={{ from: stopId }}
        className={`r-row r-dep${first ? " r-dep--first" : ""}`}
      >
        <span className={`r-pill r-tnum r-dep-pill${first ? " r-pill--y" : ""}`}>
          <i className="ph ph-bus" aria-hidden="true" />
          {routeShort}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium leading-snug">{title}</span>
          <span className="r-lbl mt-0.5 block r-tnum">
            {scheduledLabel}
            {band ? ` · ${band}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pl-1 text-right">
          <span className="text-[20px] font-medium leading-none r-tnum">
            {showClock ? clock : `${etaMin} min`}
          </span>
          {opShift ? (
            <span className="r-lbl line-through r-tnum text-[12px]">{opShift}</span>
          ) : null}
          <span className="r-conf text-[12px]">
            {mark}
            {tierLabel}
          </span>
        </span>
      </Link>
      <details className={`r-dep-more${first ? " r-dep-more--first" : ""}`}>
        <summary aria-label={moreLabel}>
          <span className="r-dep-hints">{hints}</span>
          <i className="ph ph-caret-down r-dep-caret" aria-hidden="true" />
        </summary>
      </details>
    </>
  );
}
