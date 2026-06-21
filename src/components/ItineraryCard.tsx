// Editorial multi-leg itinerary card.
// Renders 1–3 legs in Aloya's Mediterranean treatment: numerals-first,
// no generic transit chips, calm timeline on expand. Wait + walk legs
// are first-class.

import { useMemo, useState } from "react";
import type { Itinerary, RationaleTag, RideLeg } from "@/lib/itinerary-types";
import { routeTone } from "@/lib/gtfs";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

// Rationale tag → i18n key (with optional vars). Keeping the keys as
// string literals here ensures the dictionary type guards still fire.
type T = (key: never, vars?: Record<string, string | number>) => string;
function rationaleToCopy(tag: RationaleTag, t: T): string {
  switch (tag.kind) {
    case "fastest":
      return t("rationale.fastest" as never, { m: tag.minutesEarlier });
    case "no-changes":
      return t("rationale.noChanges" as never);
    case "fewer-changes":
      return tag.n === 1
        ? t("rationale.fewerChangesOne" as never)
        : t("rationale.fewerChanges" as never);
    case "less-walking":
      return t("rationale.lessWalking" as never, { m: tag.metersSaved });
    case "all-live":
      return t("rationale.allLive" as never);
    case "more-reliable":
      return t("rationale.moreReliable" as never);
    case "leaves-sooner":
      return t("rationale.leavesSooner" as never, { m: tag.minutesSooner });
    case "best-overall":
      return t("rationale.bestOverall" as never);
  }
}

function fmtMin(sec: number) {
  const m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}`;
}
function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ItineraryCard({
  itinerary,
  highlight,
  onStart,
  startLabel,
  startDisabled,
}: {
  itinerary: Itinerary;
  highlight: boolean;
  onStart?: () => void;
  startLabel: string;
  startDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  const rides = useMemo(
    () => itinerary.legs.filter((l): l is RideLeg => l.kind === "ride"),
    [itinerary.legs],
  );
  const firstRide = rides[0];

  const totalMin = Math.round(itinerary.totalDurationSec / 60);
  const departIn = Math.max(
    0,
    Math.round((itinerary.departureUnix - Date.now() / 1000) / 60),
  );

  const reliability = useMemo(() => {
    const totalDelay = rides.reduce((s, r) => s + (r.delaySec || 0), 0);
    if (rides.every((r) => r.live)) {
      if (totalDelay > 90) return { tone: "ochre", text: t("itin.usualPlus", { m: Math.round(totalDelay / 60) }) };
      if (totalDelay < -90) return { tone: "olive", text: t("itin.usualMinus", { m: Math.round(totalDelay / 60) }) };
      return { tone: "aegean", text: t("itin.onTime") };
    }
    if (itinerary.source === "mixed") return { tone: "aegean", text: t("itin.liveSched") };
    return { tone: "ink-soft", text: t("itin.scheduled") };
  }, [rides, itinerary.source, t]);

  const sourceLabel =
    itinerary.source === "live"
      ? t("itin.leavesIn", { n: departIn })
      : t("itin.leavesAt", { t: fmtTime(itinerary.departureUnix) });


  return (
    <article
      className={`rounded-[28px] p-5 transition-all ${
        highlight
          ? "bg-card ring-2 ring-aegean-deep/40 shadow-[0_18px_50px_-30px_rgba(15,60,80,0.35)]"
          : "bg-card ring-1 ring-line"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-sans text-[12px] font-semibold text-ink-soft">
            {sourceLabel}
          </p>
          <h3 className="mt-1.5 font-display text-[24px] font-semibold leading-tight text-ink text-pretty">
            {itinerary.transfers === 0 ? (
              <>
                {t("itin.boardAtPrefix")}{" "}
                <span className="text-aegean-deep">{firstRide?.board.name}</span>
              </>
            ) : (
              <>
                {itinerary.transfers === 1 ? t("itin.oneChange") : t("itin.changes", { n: itinerary.transfers })}{" "}
                {t("itin.via")}{" "}

                <span className="text-aegean-deep">
                  {firstRide?.alight.name}
                </span>
              </>
            )}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <p
            className={`font-display text-[40px] font-semibold leading-none tabular-nums ${
              highlight ? "text-aegean-deep" : "text-ink"
            }`}
          >
            {totalMin}
            <span className="ml-1 font-sans text-[12px] font-semibold text-ink-soft">
              {t("itin.min")}
            </span>
          </p>
          <p className="mt-1.5 font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
            {t("itin.arr", { t: fmtTime(itinerary.arrivalUnix) })}
          </p>
        </div>
      </div>

      {/* Leg ribbon */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {rides.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 ? (
              <span className="font-sans text-[12px] font-semibold text-ink-soft">
                {t("itin.change")}
              </span>
            ) : null}
            <RouteChip code={r.routeShort} tone={routeTone(r.routeId)} />
          </span>
        ))}
        <span
          className={`ml-auto font-sans text-[12px] font-semibold ${
            reliability.tone === "ochre"
              ? "text-ochre"
              : reliability.tone === "olive"
                ? "text-olive"
                : reliability.tone === "aegean"
                  ? "text-aegean-deep"
                  : "text-ink-soft"
          }`}
        >
          {reliability.text}
        </span>
      </div>

      {/* Wave 2.4 — "Why this route?" rationale */}
      {itinerary.rationale && itinerary.rationale.length > 0 ? (
        <div className="mt-3 rounded-2xl bg-limestone-soft/60 px-3.5 py-2.5 ring-1 ring-line/70">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
            {t("rationale.eyebrow")}
          </p>
          <p className="mt-1 font-sans text-[13px] font-semibold leading-snug text-ink text-pretty">
            {itinerary.rationale
              .map((tag) => rationaleToCopy(tag, t))
              .join(" — ")}
          </p>
        </div>
      ) : null}

      {/* Timeline (collapsible) */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="font-sans text-[12px] font-semibold text-ink-soft tabular-nums">
          {t("itin.metersWalk", { m: Math.round(itinerary.totalWalkMeters) })}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-full bg-limestone-soft px-3 py-1.5 font-sans text-[12px] font-semibold text-ink ring-1 ring-line hover:bg-limestone-soft/70 transition-colors"
        >
          {expanded ? t("itin.hideDetails") : t("itin.showDetails")}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {expanded ? (
        <ol className="mt-3 border-l border-line ml-2 pl-4 space-y-3">
          {itinerary.legs.map((leg, i) => (
            <li key={i} className="text-[13px] leading-snug">
              {leg.kind === "ride" ? (
                <div>
                  <p className="text-ink font-medium">
                    <span className="font-sans text-[12px] font-bold text-aegean-deep mr-2 tabular-nums">
                      {leg.routeShort}
                    </span>
                    {leg.board.name.split(",")[0]}
                    <span className="text-ink-soft"> → </span>
                    {leg.alight.name.split(",")[0]}
                  </p>
                  <p className="font-sans text-[12px] font-semibold text-ink-soft mt-1 tabular-nums">
                    {fmtTime(leg.board.departureUnix)} —{" "}
                    {fmtTime(leg.alight.arrivalUnix)} · {leg.live
                      ? t("itin.stopsLive", { n: leg.stopCount })
                      : t("itin.stops", { n: leg.stopCount })}
                  </p>
                </div>
              ) : leg.kind === "walk" ? (
                <p className="text-ink">
                  <span className="font-sans text-[12px] font-bold mr-2 text-ink tabular-nums">
                    {t("itin.walk")} {fmtMin(leg.durationSec)}
                  </span>
                  <span className="text-ink-soft">
                    {leg.from.name.split(",")[0]} → {leg.to.name.split(",")[0]}
                  </span>
                </p>
              ) : (
                <p className="text-ink">
                  <span className="font-sans text-[12px] font-bold mr-2 text-ink tabular-nums">
                    {t("itin.wait")} {fmtMin(leg.durationSec)}
                  </span>
                  <span className="text-ink-soft">{t("itin.at")} {leg.name.split(",")[0]}</span>
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : null}



      <button
        onClick={onStart}
        disabled={startDisabled || !onStart}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-sans text-[15px] font-semibold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          highlight
            ? "bg-ink text-limestone hover:bg-ink/90"
            : "bg-limestone-soft text-ink hover:bg-limestone-soft/70"
        }`}
      >
        {startLabel}
        {!startDisabled ? <IconArrowUpRight className="size-4" /> : null}
      </button>

    </article>
  );
}
