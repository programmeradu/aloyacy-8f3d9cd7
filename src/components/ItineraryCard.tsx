// Go results card (Roam): the recommended option is the charcoal journey card
// with the yellow dot timeline, the rest are white cards. Same data and
// controls as before: leaves in / at, total time, arrival, line ribbon,
// reliability, "why this option", walk distance, expandable legs, Start.
// Trips with two or more changes show a compact card: chain on one row,
// times, leg bar and one summary line; the change rows sit in Show details.
import { useMemo, useState } from "react";
import type { Itinerary, RationaleTag, RideLeg } from "@/lib/itinerary-types";
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "@/components/roam/Icon";
import {
  ChangeList,
  LegBar,
  LegChain,
  LegsTimeline,
} from "@/components/roam/journey/JourneyParts";
import { journeyParts, mins, shortName } from "@/components/roam/journey/journey-model";

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
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
function fmtTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
}
// Card end labels: first part of a stop name ("A, B" or "A - B" becomes "A"),
// without the platform word GTFS adds to paired stops ("Solomos Square
// Alighting" reads "Solomos Square").
const short = (s: string) => shortName(s);

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
  const { t, r: rt } = useRoamI18n();
  const dark = highlight;

  const rides = useMemo(
    () => itinerary.legs.filter((l): l is RideLeg => l.kind === "ride"),
    [itinerary.legs],
  );
  const firstRide = rides[0];
  const lastRide = rides[rides.length - 1];

  const departIn = Math.max(0, Math.round((itinerary.departureUnix - Date.now() / 1000) / 60));

  const reliability = useMemo(() => {
    const totalDelay = rides.reduce((s, r) => s + (r.delaySec || 0), 0);
    if (rides.length > 0 && rides.every((r) => r.live)) {
      if (totalDelay > 90)
        return { live: true, text: t("itin.usualPlus", { m: Math.round(totalDelay / 60) }) };
      if (totalDelay < -90)
        return { live: true, text: t("itin.usualMinus", { m: Math.round(totalDelay / 60) }) };
      return { live: true, text: t("itin.onTime") };
    }
    if (itinerary.source === "mixed") return { live: true, text: t("itin.liveSched") };
    return { live: false, text: t("itin.scheduled") };
  }, [rides, itinerary.source, t]);

  const sourceLabel =
    itinerary.source === "live"
      ? departIn <= 0
        ? t("itin.leavesNow")
        : t("itin.leavesIn", { n: departIn })
      : t("itin.leavesAt", { t: fmtTime(itinerary.departureUnix) });
  const changes =
    itinerary.transfers === 0
      ? t("itin.boardAtPrefix") + " " + short(firstRide?.board.name ?? "")
      : itinerary.transfers === 1
        ? t("itin.oneChange")
        : t("itin.changes", { n: itinerary.transfers });

  const walkText =
    itinerary.totalWalkMeters >= 1000
      ? t("itin.kmWalk", { km: (itinerary.totalWalkMeters / 1000).toFixed(1) })
      : t("itin.metersWalk", { m: Math.round(itinerary.totalWalkMeters) });
  // Trips with two or more changes keep the card compact: the per-change
  // rows live in Show details, and one short line sums the changes up.
  const compact = rides.length >= 3;
  const parts = useMemo(() => journeyParts(itinerary), [itinerary]);
  const longestWait = parts.changes.reduce((m, c) => Math.max(m, c.waitSec), 0);
  const summary = compact
    ? [
        ...(itinerary.source === "live" ? [sourceLabel] : []),
        rt("jl.changesN", { n: itinerary.transfers }),
        walkText,
        ...(longestWait >= 60 ? [rt("jl.longestWait", { m: mins(longestWait) })] : []),
      ]
    : [sourceLabel, changes, walkText];
  const mute = dark ? "var(--r-onchar-mute)" : "var(--r-mute)";
  const pillBg = dark ? "#3b3b3b" : "var(--r-pill)";
  const pillFg = dark ? "#fff" : "var(--r-ink)";

  return (
    <article
      className={dark ? "r-jc" : "r-card"}
      style={{
        padding: "18px 18px 16px",
        boxShadow: dark ? "0 18px 40px -24px rgba(0,0,0,.6)" : undefined,
      }}
    >
      <LegChain itinerary={itinerary} dark={dark} />
      <div className="mt-2.5 flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[14px] leading-snug" style={{ color: mute }}>
          {summary
            .join(", ")
            // keep numbers with their units on one line
            .replace(/(\d) (m|km|min)\b/g, "$1\u00a0$2")}
        </p>
        <span className="r-conf shrink-0" style={{ color: mute }}>
          {reliability.live ? <span className="r-dot" /> : <span className="r-ring" />}
          {reliability.text}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-baseline gap-3 r-tnum">
        <span className="text-[14px]" style={{ color: mute }}>
          {fmtTime(itinerary.departureUnix)}
        </span>
        <span className="text-center text-[16px] font-medium">
          {fmtMin(itinerary.totalDurationSec)}
        </span>
        <span className="text-[14px]" style={{ color: mute }}>
          {fmtTime(itinerary.arrivalUnix)}
        </span>
      </div>
      {rides.length > 1 ? (
        <div className="mt-2">
          <LegBar itinerary={itinerary} dark={dark} />
        </div>
      ) : (
        <div className="r-tl-line mt-2" style={{ height: 22 }} aria-hidden="true">
          <span className="ln" style={dark ? undefined : { background: "#cfcfca" }} />
          <span className="e" style={{ left: 0 }} />
          <span className="e" style={{ right: 0 }} />
          {rides.length > 0 ? (
            <span
              className="absolute left-1/2 top-1/2 flex size-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
              style={{
                background: dark ? "var(--r-char)" : "#fff",
                color: dark ? "#fff" : "var(--r-ink)",
                boxShadow: `0 0 0 1.6px ${dark ? "var(--r-y)" : "#cfcfca"}`,
              }}
            >
              <Icon name="bus" size={14} />
            </span>
          ) : null}
        </div>
      )}
      <div className="mt-2 flex items-start justify-between gap-2 text-[14px] leading-[18px]">
        <span className="min-w-0 flex-1 break-words">
          {short(firstRide?.board.name ?? "")}
        </span>
        <span className="min-w-0 flex-1 break-words text-right">
          {short(lastRide?.alight.name ?? "")}
        </span>
      </div>

      {rides.length === 2 ? <ChangeList itinerary={itinerary} dark={dark} /> : null}

      {itinerary.rationale && itinerary.rationale.length > 0 ? (
        <p
          className="mt-3 flex items-start gap-2 text-[13px] leading-snug"
          style={{ color: dark ? "#e8e8e4" : "var(--r-ink2)" }}
        >
          <Icon name="sparkle" size={15} style={{ color: "var(--r-y)", marginTop: 1 }} />
          <span className={compact ? "min-w-0 truncate" : undefined}>
            <span className="sr-only">{t("rationale.eyebrow")}: </span>
            {(compact ? itinerary.rationale.slice(0, 1) : itinerary.rationale)
              .map((tag) => rationaleToCopy(tag, t as T))
              .map((s, i) => (i === 0 ? s : s.charAt(0).toLocaleLowerCase() + s.slice(1)))
              .join(", ")}
          </span>
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-4">
          <LegsTimeline itinerary={itinerary} dark={dark} />
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          className="r-pill r-pill--lg"
          style={{ background: pillBg, color: pillFg }}
        >
          {expanded ? t("itin.hideDetails") : t("itin.showDetails")}
          <Icon name={expanded ? "caret-up" : "caret-down"} size={15} />
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={startDisabled || !onStart}
          className="ml-auto inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={
            dark
              ? { background: "#fff", color: "var(--r-ink)" }
              : { background: "var(--r-char)", color: "#fff" }
          }
        >
          {startLabel}
          {!startDisabled ? <Icon name="arrow-up-right" size={16} /> : null}
        </button>
      </div>
    </article>
  );
}
