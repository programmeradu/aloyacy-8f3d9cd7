// The floating stop card on Now: nearest (or picked) stop, Next / Then
// departures, walk distance, confidence, and a docked button into the stop.
// Every state of the old Sky card is kept: loading, no location, no buses,
// feed error and a real bus.
import { Link } from "@tanstack/react-router";
import type { CardState, NextBus, NearbyLine } from "@/components/home/sky-state";
import { useRoamI18n } from "@/lib/roam-i18n";
import { NotchCard } from "../NotchCard";
import { Icon } from "../Icon";
import { ConfTag, Squiggle, type Confidence } from "../bits";

function confOf(b: NextBus): Confidence {
  return b.backing === "live" ? "live" : b.backing === "estimated" ? "est" : "tt";
}

type Props = {
  state: CardState;
  tiles: NearbyLine[];
  linesAtStop: number;
  walkM: number | null;
  onAllowLocation: () => void;
  onPickStop: () => void;
  onRetry: () => void;
};

export function NowCard({ state, tiles, linesAtStop, walkM, onAllowLocation, onPickStop, onRetry }: Props) {
  const { r } = useRoamI18n();
  const bus = state.kind === "bus" ? state.bus : null;
  const stopId = bus?.stopId ?? (state.kind === "none" ? state.stopId : null);
  const stopName = bus?.stopName ?? (state.kind === "none" ? state.stopName : null);

  const dock = stopId ? (
    <Link
      to="/stop/$stopId"
      params={{ stopId }}
      className="r-fb r-fb--lg"
      aria-label={r("now.openStop", { name: stopName ?? "" })}
      style={{ background: "rgba(90,90,86,.42)" }}
    >
      <Icon name="arrow-up-right" />
    </Link>
  ) : null;

  const then = bus
    ? (tiles.find((t) => t.routeId !== bus.routeId) ??
      (bus.then[0] ? { line: bus.line, etaMin: Math.max(0, Math.round((bus.then[0] - Date.now() / 1000) / 60)), live: false } : null))
    : null;

  return (
    <NotchCard
      notches={dock ? [{ edge: "bottom", cx: 0, center: true, width: 116, depth: 26, dock }] : []}
      shadow="drop-shadow(0 14px 28px rgba(0,0,0,.22))"
      className="r-rise"
      aria-label={stopName ?? r("now.title")}
      as="section"
    >
      <div className="px-6 pt-5 pb-7 min-h-[176px]">
        {state.kind === "loading" ? (
          <div aria-busy="true">
            <div className="h-7 w-48 rounded-lg bg-[#eeeeea] animate-pulse" />
            <div className="mt-3 h-4 w-32 rounded bg-[#eeeeea] animate-pulse" />
            <div className="mt-8 flex gap-2">
              <div className="h-9 w-28 rounded-full bg-[#eeeeea] animate-pulse" />
              <div className="h-9 w-28 rounded-full bg-[#eeeeea] animate-pulse" />
            </div>
            <span className="sr-only">{r("now.locating")}</span>
          </div>
        ) : state.kind === "no-location" ? (
          <div>
            <p className="r-t2">{r("now.noLoc")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {!state.denied ? (
                <button type="button" className="r-pill r-pill--k r-pill--lg" onClick={onAllowLocation}>
                  <Icon name="navigation-arrow" />
                  {r("now.allow")}
                </button>
              ) : null}
              <button type="button" className="r-pill r-pill--lg" onClick={onPickStop}>
                <Icon name="map-pin" />
                {r("now.pick")}
              </button>
            </div>
          </div>
        ) : state.kind === "error" ? (
          <div>
            <p className="r-t2">{r("now.error")}</p>
            <button type="button" className="r-pill r-pill--k r-pill--lg mt-5" onClick={onRetry}>
              <Icon name="arrow-clockwise" />
              {r("now.retry")}
            </button>
          </div>
        ) : state.kind === "none" ? (
          <div>
            <h2 className="r-t2 truncate" style={{ fontSize: 26 }}>
              {stopName ?? r("now.title")}
            </h2>
            <p className="r-t3 mt-4">{r("now.none")}</p>
            <p className="r-lbl mt-1">{r("now.noneSub")}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" className="r-pill" onClick={onPickStop}>
                <Icon name="map-pin" />
                {r("now.pick")}
              </button>
              <Link to="/trips" className="r-pill">
                <Icon name="path" />
                {r("now.planTrip")}
              </Link>
            </div>
          </div>
        ) : bus ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate font-medium" style={{ fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.15 }}>
                  {bus.stopName}
                </h2>
                <p className="r-lbl mt-1">
                  {linesAtStop === 1 ? r("now.line1") : r("now.lines", { n: linesAtStop })}
                </p>
              </div>
              <ConfTag kind={confOf(bus)} pill />
            </div>
            <div className="mt-5 grid grid-cols-[auto_auto_1fr] items-end gap-x-2">
              <span className="r-lbl">{r("now.next")}</span>
              <span className="r-lbl">{then ? r("now.then") : ""}</span>
              <span className="text-right r-tnum text-[15px] font-medium">
                {walkM != null && bus.walkMin != null ? (
                  <>
                    {walkM} m <span className="text-[var(--r-mute)] font-normal">· {bus.walkMin} {r("now.min")}</span>
                  </>
                ) : null}
              </span>
              <span className="r-pill r-pill--y r-tnum mt-2" style={{ height: 36, borderRadius: 18 }}>
                <Icon name="bus" />
                {bus.line} · {bus.etaMin} {r("now.min")}
              </span>
              {then ? (
                <span className="r-pill r-tnum mt-2" style={{ height: 36, borderRadius: 18 }}>
                  <Icon name="bus" />
                  {then.line} · {then.etaMin} {r("now.min")}
                </span>
              ) : (
                <span />
              )}
              <span className="flex justify-end -mr-2 mt-1">
                <Squiggle width={104} height={38} />
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </NotchCard>
  );
}
