// Editorial multi-leg itinerary card.
// Renders 1–3 legs in Aloya's Mediterranean treatment: numerals-first,
// no generic transit chips, calm timeline on expand. Wait + walk legs
// are first-class.

import { useMemo, useState } from "react";
import type { Itinerary, RideLeg } from "@/lib/itinerary-types";
import { routeTone } from "@/lib/gtfs";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight } from "@/components/Icons";

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
      if (totalDelay > 90) return { tone: "ochre", text: `+${Math.round(totalDelay / 60)} min usual` };
      if (totalDelay < -90) return { tone: "olive", text: `${Math.round(totalDelay / 60)} min usual` };
      return { tone: "aegean", text: "on time" };
    }
    if (itinerary.source === "mixed") return { tone: "aegean", text: "live + sched" };
    return { tone: "ink-soft", text: "scheduled" };
  }, [rides, itinerary.source]);

  const sourceLabel =
    itinerary.source === "live"
      ? `Leaves in ${departIn} min`
      : `Leaves ${fmtTime(itinerary.departureUnix)}`;


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
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft">
            {sourceLabel}
          </p>
          <h3 className="mt-1.5 font-display text-[24px] font-semibold leading-tight text-ink text-pretty">
            {itinerary.transfers === 0 ? (
              <>
                Board at{" "}
                <span className="text-aegean-deep">{firstRide?.board.name}</span>
              </>
            ) : (
              <>
                {itinerary.transfers === 1 ? "One change" : `${itinerary.transfers} changes`}{" "}
                via{" "}
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
            <span className="ml-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft">
              min
            </span>
          </p>
          <p className="mt-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft tabular-nums">
            arr {fmtTime(itinerary.arrivalUnix)}
          </p>
        </div>
      </div>

      {/* Leg ribbon */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {rides.map((r, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 ? (
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft">
                change
              </span>
            ) : null}
            <RouteChip code={r.routeShort} tone={routeTone(r.routeId)} />
          </span>
        ))}
        <span
          className={`ml-auto font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${
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

      {/* Timeline (collapsible) */}
      <button
        onClick={() => setExpanded((x) => !x)}
        className="mt-4 flex w-full items-center justify-between font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft hover:text-ink"
      >
        <span>
          {Math.round(itinerary.totalWalkMeters)} m walk
        </span>
        <span>{expanded ? "Hide" : "Details"}</span>
      </button>

      {expanded ? (
        <ol className="mt-3 border-l border-line ml-2 pl-4 space-y-3">
          {itinerary.legs.map((leg, i) => (
            <li key={i} className="text-[13px] leading-snug">
              {leg.kind === "ride" ? (
                <div>
                  <p className="text-ink font-medium">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-aegean-deep mr-2 tabular-nums">
                      {leg.routeShort}
                    </span>
                    {leg.board.name.split(",")[0]}
                    <span className="text-ink-soft"> → </span>
                    {leg.alight.name.split(",")[0]}
                  </p>
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-soft mt-1 tabular-nums">
                    {fmtTime(leg.board.departureUnix)} —{" "}
                    {fmtTime(leg.alight.arrivalUnix)} · {leg.stopCount} stops
                    {leg.live ? " · live" : ""}
                  </p>
                </div>
              ) : leg.kind === "walk" ? (
                <p className="text-ink">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] mr-2 text-ink tabular-nums">
                    walk {fmtMin(leg.durationSec)}
                  </span>
                  <span className="text-ink-soft">
                    {leg.from.name.split(",")[0]} → {leg.to.name.split(",")[0]}
                  </span>
                </p>
              ) : (
                <p className="text-ink">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] mr-2 text-ink tabular-nums">
                    wait {fmtMin(leg.durationSec)}
                  </span>
                  <span className="text-ink-soft">at {leg.name.split(",")[0]}</span>
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : null}



      <button
        onClick={onStart}
        disabled={startDisabled || !onStart}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          highlight
            ? "bg-ink text-limestone hover:bg-ink/90"
            : "bg-limestone-soft text-ink hover:bg-limestone-soft/70"
        }`}
      >
        {startLabel}
        {!startDisabled ? <IconArrowUpRight className="size-3.5" /> : null}
      </button>
    </article>
  );
}
