// Go results card (Roam): the recommended option is the charcoal journey card
// with the yellow dot timeline, the rest are white cards. Same data and
// controls as before: leaves in / at, total time, arrival, line ribbon,
// reliability, "why this option", walk distance, expandable legs, Start.
import { useMemo, useState } from "react";
import type { Itinerary, RationaleTag, RideLeg } from "@/lib/itinerary-types";
import { useRoamI18n } from "@/lib/roam-i18n";
import { Icon } from "@/components/roam/Icon";

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
const short = (s: string) => s.split(",")[0];

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
      if (totalDelay > 90) return { live: true, text: t("itin.usualPlus", { m: Math.round(totalDelay / 60) }) };
      if (totalDelay < -90) return { live: true, text: t("itin.usualMinus", { m: Math.round(totalDelay / 60) }) };
      return { live: true, text: t("itin.onTime") };
    }
    if (itinerary.source === "mixed") return { live: true, text: t("itin.liveSched") };
    return { live: false, text: t("itin.scheduled") };
  }, [rides, itinerary.source, t]);

  const sourceLabel =
    itinerary.source === "live"
      ? t("itin.leavesIn", { n: departIn })
      : t("itin.leavesAt", { t: fmtTime(itinerary.departureUnix) });
  const changes =
    itinerary.transfers === 0
      ? t("itin.boardAtPrefix") + " " + short(firstRide?.board.name ?? "")
      : itinerary.transfers === 1
        ? t("itin.oneChange")
        : t("itin.changes", { n: itinerary.transfers });

  const mute = dark ? "var(--r-onchar-mute)" : "var(--r-mute)";
  const pillBg = dark ? "#3b3b3b" : "var(--r-pill)";
  const pillFg = dark ? "#fff" : "var(--r-ink)";

  return (
    <article
      className={dark ? "r-jc" : "r-card"}
      style={{ padding: "18px 18px 16px", boxShadow: dark ? "0 18px 40px -24px rgba(0,0,0,.6)" : undefined }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {rides.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 ? <Icon name="caret-right" size={13} style={{ color: mute }} /> : null}
                <span className="r-pill r-tnum" style={{ height: 28, background: i === 0 && dark ? "var(--r-y)" : pillBg, color: i === 0 && dark ? "var(--r-ink)" : pillFg }}>
                  <Icon name="bus" size={16} />
                  {r.routeShort}
                </span>
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[14px] leading-snug" style={{ color: mute }}>
            {sourceLabel} · {changes} · {t("itin.metersWalk", { m: Math.round(itinerary.totalWalkMeters) })}
          </p>
        </div>
        <span className="r-conf shrink-0 pt-1" style={{ color: mute }}>
          {reliability.live ? <span className="r-dot" /> : <span className="r-ring" />}
          {reliability.text}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-baseline gap-3 r-tnum">
        <span className="text-[14px]" style={{ color: mute }}>{fmtTime(itinerary.departureUnix)}</span>
        <span className="text-center text-[16px] font-medium">{fmtMin(itinerary.totalDurationSec)}</span>
        <span className="text-[14px]" style={{ color: mute }}>{fmtTime(itinerary.arrivalUnix)}</span>
      </div>
      <div className="r-tl-line mt-2" style={{ height: 22 }} aria-hidden="true">
        <span className="ln" style={dark ? undefined : { background: "#cfcfca" }} />
        <span className="e" style={{ left: 0 }} />
        <span className="e" style={{ right: 0 }} />
        {rides.length > 0 ? (
          <span
            className="absolute left-1/2 top-1/2 flex size-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ background: dark ? "var(--r-char)" : "#fff", color: dark ? "#fff" : "var(--r-ink)", boxShadow: `0 0 0 1.6px ${dark ? "var(--r-y)" : "#cfcfca"}` }}
          >
            <Icon name="bus" size={14} />
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[14px]">
        <span className="min-w-0 truncate">{short(firstRide?.board.name ?? "")}</span>
        {rides.length > 1 ? (
          <span className="r-dpill shrink-0" style={dark ? undefined : { background: "var(--r-pill)", color: "var(--r-ink)" }}>
            {rt("go.legs", { n: rides.length })}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-right">{short(lastRide?.alight.name ?? "")}</span>
      </div>

      {itinerary.rationale && itinerary.rationale.length > 0 ? (
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug" style={{ color: dark ? "#e8e8e4" : "var(--r-ink2)" }}>
          <Icon name="sparkle" size={15} style={{ color: "var(--r-y)", marginTop: 1 }} />
          <span>
            <span className="sr-only">{t("rationale.eyebrow")}: </span>
            {itinerary.rationale.map((tag) => rationaleToCopy(tag, t as T)).join(" · ")}
          </span>
        </p>
      ) : null}

      {expanded ? (
        <ol className="mt-3 ml-1.5 space-y-3 border-l pl-4" style={{ borderColor: dark ? "#444" : "var(--r-line)" }}>
          {itinerary.legs.map((leg, i) => (
            <li key={i} className="text-[14px] leading-snug">
              {leg.kind === "ride" ? (
                <div>
                  <p>
                    <span className="mr-2 font-semibold r-tnum">{leg.routeShort}</span>
                    {short(leg.board.name)}
                    <span style={{ color: mute }}> → </span>
                    {short(leg.alight.name)}
                  </p>
                  <p className="mt-1 text-[13px] r-tnum" style={{ color: mute }}>
                    {fmtTime(leg.board.departureUnix)} → {fmtTime(leg.alight.arrivalUnix)} ·{" "}
                    {t("itin.stops", { n: leg.stopCount })}
                    {leg.live ? ` · ${rt("conf.live")}` : ""}
                  </p>
                </div>
              ) : leg.kind === "walk" ? (
                <p>
                  <span className="mr-2 font-semibold r-tnum">
                    {t("itin.walk")} {fmtMin(leg.durationSec)}
                  </span>
                  <span style={{ color: mute }}>
                    {short(leg.from.name)} → {short(leg.to.name)}
                  </span>
                </p>
              ) : (
                <p>
                  <span className="mr-2 font-semibold r-tnum">
                    {t("itin.wait")} {fmtMin(leg.durationSec)}
                  </span>
                  <span style={{ color: mute }}>
                    {t("itin.at")} {short(leg.name)}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ol>
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
          style={dark ? { background: "#fff", color: "var(--r-ink)" } : { background: "var(--r-char)", color: "#fff" }}
        >
          {startLabel}
          {!startDisabled ? <Icon name="arrow-up-right" size={16} /> : null}
        </button>
      </div>
    </article>
  );
}
