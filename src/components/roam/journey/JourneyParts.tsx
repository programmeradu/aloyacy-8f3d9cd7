// Roam pieces for journeys with one or more changes: the line mark (real
// operator logo or the bus glyph on the line colour), the leg pill chain,
// the proportional leg bar, the change list, the full itinerary timeline
// with expandable stops, and the change pin for maps.
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Itinerary, RideLeg } from "@/lib/itinerary-types";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n } from "@/lib/roam-i18n";
import {
  clock,
  cleanName,
  fmtDist,
  fmtDur,
  isPale,
  journeyParts,
  legColor,
  legLogo,
  mins,
  onColor,
  towards,
  type ChangeInfo,
} from "./journey-model";

type RideLike = Pick<RideLeg, "routeId" | "routeShort" | "routeLong">;

/** Real operator logo when the repo has one, else the bus glyph on the line colour. */
export function LegMark({ leg, size = 20 }: { leg: RideLike; size?: number }) {
  const logo = legLogo(leg);
  if (logo) {
    return (
      <img
        src={logo.src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="r-jl-logo"
        style={{ width: size, height: size, background: logo.bg }}
      />
    );
  }
  const c = legColor(leg);
  return (
    <span
      className="r-jl-glyph"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: c,
        color: onColor(c),
        boxShadow: isPale(c) ? "inset 0 0 0 1px rgba(0,0,0,.18)" : undefined,
      }}
    >
      <Icon name="bus" size={Math.round(size * 0.62)} />
    </span>
  );
}

/** Line pill: mark plus the line number (or Kapnos), on white or charcoal. */
export function JLinePill({
  leg,
  dark = false,
  size = "md",
}: {
  leg: RideLike;
  dark?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const h = size === "lg" ? 34 : size === "sm" ? 26 : size === "xs" ? 22 : 30;
  const fs = size === "lg" ? 16 : size === "sm" ? 13 : size === "xs" ? 12 : 14;
  const mark = size === "lg" ? 24 : size === "sm" ? 18 : size === "xs" ? 16 : 20;
  return (
    <span
      className={`r-jl-pill r-tnum${dark ? " is-dark" : ""} is-${size}`}
      style={{ height: h, fontSize: fs }}
    >
      <LegMark leg={leg} size={mark} />
      <span>{leg.routeShort}</span>
    </span>
  );
}

// Fit levels for the chain, tried in order until it sits on one row: pill
// size and whether a walk link carries its minutes.
type ChainLevel = { size: "md" | "sm" | "xs"; walkText: boolean };
const LEVELS_FEW: ChainLevel[] = [
  { size: "md", walkText: true },
  { size: "md", walkText: false },
  { size: "sm", walkText: false },
  { size: "xs", walkText: false },
];
// Four or more rides start compact, walk links as a small icon only.
const LEVELS_MANY: ChainLevel[] = [
  { size: "sm", walkText: false },
  { size: "xs", walkText: false },
];

/**
 * Pills for every ride with the walk or wait between them, always on one
 * row. Each link is glued to the pill after it, so a separator is never
 * left on its own; when the row is too narrow the pills step down in size,
 * and as a last resort the whole row is scaled down. It never wraps.
 */
export function LegChain({
  itinerary,
  dark = false,
  white = false,
}: {
  itinerary: Itinerary;
  dark?: boolean;
  /** White pills, for chains that sit on a grey panel. */
  white?: boolean;
}) {
  const { r } = useRoamI18n();
  const p = journeyParts(itinerary);
  const levels = p.rides.length >= 4 ? LEVELS_MANY : LEVELS_FEW;
  const boxRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const fitWidth = useRef(0);
  const [lvl, setLvl] = useState(0);
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(0);
  const level = levels[Math.min(lvl, levels.length - 1)];

  // Track the space the chain has; a new width starts the fit again.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(Math.round(box.clientWidth)));
    ro.observe(box);
    setWidth(Math.round(box.clientWidth));
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const row = rowRef.current;
    if (!box || !row || width === 0) return;
    if (width !== fitWidth.current) {
      fitWidth.current = width;
      if (lvl !== 0 || scale !== 1) {
        setLvl(0);
        setScale(1);
        return;
      }
    }
    if (scale !== 1) return;
    const need = row.scrollWidth;
    const have = box.clientWidth;
    if (need <= have + 0.5) return;
    if (lvl < levels.length - 1) setLvl(lvl + 1);
    else setScale(Math.max(0.6, Math.floor((have / need) * 100) / 100));
  }, [lvl, scale, width, levels]);

  return (
    <div ref={boxRef} className="r-jl-chainbox">
      <div
        ref={rowRef}
        className={`r-jl-chain${dark ? " is-dark" : ""}${white ? " is-white" : ""} is-${level.size}`}
        style={scale < 1 ? { zoom: scale } : undefined}
      >
        {p.rides.map((ride, i) => {
          const ch: ChangeInfo | undefined = i > 0 ? p.changes[i - 1] : undefined;
          const walk = !!ch && !(ch.sameStop || ch.walkMeters < 25);
          return (
            <span key={i} className="r-jl-unit">
              {ch ? (
                <span
                  className="r-jl-link"
                  role={walk && !level.walkText ? "img" : undefined}
                  aria-label={
                    walk && !level.walkText
                      ? r("jl.walkFact", { d: fmtDist(ch.walkMeters), m: mins(ch.walkSec) })
                      : undefined
                  }
                >
                  {!walk ? (
                    <Icon name="caret-right" size={level.size === "md" ? 13 : 12} />
                  ) : (
                    <>
                      <Icon name="person-simple-walk" size={level.size === "md" ? 14 : 13} />
                      {level.walkText ? (
                        <span className="r-tnum">{r("jl.minShort", { m: mins(ch.walkSec) })}</span>
                      ) : null}
                    </>
                  )}
                </span>
              ) : null}
              <JLinePill leg={ride} dark={dark} size={level.size} />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Proportional bar: walks dotted, waits pale, rides in line colour, change nodes between rides. */
export function LegBar({ itinerary, dark = false }: { itinerary: Itinerary; dark?: boolean }) {
  const total = Math.max(1, itinerary.legs.reduce((n, l) => n + Math.max(0, legSec(l)), 0));
  let seenRide = false;
  return (
    <div className={`r-jl-bar${dark ? " is-dark" : ""}`} aria-hidden="true">
      {itinerary.legs.map((l, i) => {
        const sec = legSec(l);
        if (sec <= 0 && l.kind !== "ride") return null;
        const grow = Math.max(sec / total, l.kind === "ride" ? 0.08 : 0.025);
        if (l.kind === "ride") {
          const c = legColor(l);
          const node = seenRide;
          seenRide = true;
          return (
            <span key={i} className="r-jl-seg is-ride" style={{ flexGrow: grow, background: c }}>
              {node ? <span className="r-jl-node" /> : null}
            </span>
          );
        }
        return (
          <span
            key={i}
            className={`r-jl-seg ${l.kind === "walk" ? "is-walk" : "is-wait"}`}
            style={{ flexGrow: grow }}
          />
        );
      })}
    </div>
  );
}

function legSec(l: Itinerary["legs"][number]): number {
  if (l.kind === "ride") return l.alight.arrivalUnix - l.board.departureUnix;
  return l.durationSec;
}

function changeFacts(ch: ChangeInfo, r: ReturnType<typeof useRoamI18n>["r"]): string[] {
  const out: string[] = [];
  if (ch.sameStop || ch.walkMeters < 25) out.push(r("jl.sameStop"));
  else out.push(r("jl.walkFact", { d: fmtDist(ch.walkMeters), m: mins(ch.walkSec) }));
  out.push(ch.waitSec >= 60 ? r("jl.waitFact", { m: mins(ch.waitSec) }) : r("jl.noWait"));
  return out;
}

/** Compact list of changes for a results card. */
export function ChangeList({ itinerary, dark = false }: { itinerary: Itinerary; dark?: boolean }) {
  const { r } = useRoamI18n();
  const p = journeyParts(itinerary);
  if (p.changes.length === 0) return null;
  return (
    <ul className={`r-jl-changes${dark ? " is-dark" : ""}`}>
      {p.changes.map((ch, i) => (
        <li key={i}>
          <span className="r-jl-changes-ic" aria-hidden="true">
            <Icon name="arrows-left-right" size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="r-jl-changes-t">
              {r("jl.changeAt", { name: cleanName(ch.to.board.name) })}
            </span>
            <span className="r-jl-changes-s r-tnum">
              {changeFacts(ch, r).join(", ")}, {r("jl.thenLine", { line: ch.to.routeShort })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The change block between two rides in the itinerary timeline. */
export function ChangeBlock({ ch, dark = false }: { ch: ChangeInfo; dark?: boolean }) {
  const { r } = useRoamI18n();
  const walk = !(ch.sameStop || ch.walkMeters < 25);
  return (
    <div className={`r-jl-change${dark ? " is-dark" : ""}`}>
      <div className="r-jl-change-head">
        <span className="r-jl-change-ic" aria-hidden="true">
          <Icon name="arrows-left-right" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="r-jl-change-k r-tnum">
            {r("jl.changeTimes", {
              a: clock(ch.from.alight.arrivalUnix),
              b: clock(ch.to.board.departureUnix),
            })}
          </span>
          <span className="r-jl-change-t">
            {r("jl.changeAt", { name: cleanName(ch.to.board.name) })}
          </span>
        </span>
      </div>
      <div className="r-jl-change-facts is-list r-tnum">
        <span className="r-jl-fact">
          <Icon name={walk ? "person-simple-walk" : "map-pin-simple"} size={15} />
          {walk
            ? r("jl.walkFact", { d: fmtDist(ch.walkMeters), m: mins(ch.walkSec) })
            : r("jl.sameStop")}
        </span>
        <span className="r-jl-fact">
          <Icon name="clock" size={15} />
          {ch.waitSec >= 60 ? r("jl.waitFact", { m: mins(ch.waitSec) }) : r("jl.noWait")}
        </span>
      </div>
      {walk ? (
        <p className="r-jl-change-sub">
          {r("jl.walkFromTo", {
            from: cleanName(ch.from.alight.name),
            to: cleanName(ch.to.board.name),
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Clock time for each intermediate stop, from the timetable. When the times
 * already sit in order between board and alight they show as they are. When
 * a live board time moved the ride (the bus runs late or early), the
 * timetable times are fitted into the live board..alight window so every
 * stop keeps its own time and the list still reads in order. A stop with no
 * timetable time stays blank.
 */
export function viaClock(leg: RideLeg): (string | null)[] {
  const via = leg.via ?? [];
  const b = leg.board.departureUnix;
  const a = leg.alight.arrivalUnix;
  const ok = (t: number) => Number.isFinite(t) && t > 0;
  const raw = via.map((v) => v.arrivalUnix);
  const inOrder = raw.every((t, i) => ok(t) && t >= b && t <= a && (i === 0 || t >= raw[i - 1]));
  if (inOrder) return raw.map((t) => clock(t));
  const known = raw.filter(ok);
  if (known.length === 0 || a <= b) return raw.map(() => null);
  // Timetable window: the scheduled board time (live board minus the known
  // delay) to the later of the last call and the scheduled alight time.
  const lo = Math.min(b - (leg.delaySec || 0), ...known);
  const hi = Math.max(a - (leg.delaySec || 0), ...known, lo + 60);
  let prev = b;
  return raw.map((t) => {
    if (!ok(t)) return null;
    const f = Math.min(1, Math.max(0, (t - lo) / (hi - lo)));
    const v = Math.max(prev, Math.round(b + f * (a - b)));
    prev = v;
    return clock(v);
  });
}

function RideSegment({
  leg,
  state,
  dark,
}: {
  leg: RideLeg;
  state: "done" | "now" | "next";
  dark: boolean;
}) {
  const { r } = useRoamI18n();
  const [open, setOpen] = useState(false);
  const c = legColor(leg);
  const via = leg.via ?? [];
  const viaTimes = viaClock(leg);
  const n = leg.stopCount;
  const rideSec = leg.alight.arrivalUnix - leg.board.departureUnix;
  const style = { "--lc": c } as CSSProperties;
  const pale = isPale(c);
  return (
    <>
      <li className={`r-jl-row is-stop is-${state}`} style={style}>
        <span className="r-jl-time r-tnum">{clock(leg.board.departureUnix)}</span>
        <span className={`r-jl-rail is-top${pale ? " is-pale" : ""}`}>
          <span className="r-jl-dot is-big" />
        </span>
        <span className="r-jl-body">
          <span className="r-jl-k">{r("jl.getOn")}</span>
          <span className="r-jl-name">{cleanName(leg.board.name)}</span>
        </span>
      </li>
      <li className={`r-jl-row is-ride is-${state}`} style={style}>
        <span className="r-jl-time" />
        <span className={`r-jl-rail${pale ? " is-pale" : ""}`} />
        <span className="r-jl-body">
          <span className="r-jl-ridecard">
            <span className="flex items-center gap-2">
              <JLinePill leg={leg} dark={dark} />
              <span className="r-jl-towards">{r("jl.towards", { dest: towards(leg) })}</span>
            </span>
            {via.length > 0 ? (
              <button
                type="button"
                className="r-jl-stopsbtn r-tnum"
                aria-expanded={open}
                onClick={() => setOpen((x) => !x)}
              >
                <span>
                  {n === 1 ? r("jl.stop1") : r("jl.stops", { n })}, {fmtDur(rideSec)}
                </span>
                <Icon name={open ? "caret-up" : "caret-down"} size={14} />
              </button>
            ) : (
              <span className="r-jl-stopsline r-tnum">
                {n === 1 ? r("jl.stop1") : r("jl.stops", { n })}, {fmtDur(rideSec)}
              </span>
            )}
          </span>
        </span>
      </li>
      {open
        ? via.map((v, i) => (
            <li key={i} className={`r-jl-row is-via is-${state}`} style={style}>
              <span className="r-jl-time r-tnum">{viaTimes[i] ?? ""}</span>
              <span className={`r-jl-rail${pale ? " is-pale" : ""}`}>
                <span className="r-jl-dot is-small" />
              </span>
              <span className="r-jl-body">
                <span className="r-jl-vianame">{cleanName(v.name)}</span>
              </span>
            </li>
          ))
        : null}
      <li className={`r-jl-row is-stop is-${state}`} style={style}>
        <span className="r-jl-time r-tnum">{clock(leg.alight.arrivalUnix)}</span>
        <span className={`r-jl-rail is-bottom${pale ? " is-pale" : ""}`}>
          <span className="r-jl-dot is-big" />
        </span>
        <span className="r-jl-body">
          <span className="r-jl-k">{r("jl.getOff")}</span>
          <span className="r-jl-name">{cleanName(leg.alight.name)}</span>
        </span>
      </li>
    </>
  );
}

/**
 * Full itinerary timeline: start walk, each ride as a coloured segment with
 * board stop, expandable stop list and alight stop, a change block between
 * rides, then the final walk and arrival.
 */
export function LegsTimeline({
  itinerary,
  destLabel,
  activeLegIndex,
  dark = false,
}: {
  itinerary: Itinerary;
  destLabel?: string;
  /** Live trip: legs before this index are done, the leg at it is current. */
  activeLegIndex?: number;
  dark?: boolean;
}) {
  const { r } = useRoamI18n();
  const p = journeyParts(itinerary);
  const stateOf = (legIdx: number, endIdx = legIdx): "done" | "now" | "next" =>
    activeLegIndex == null
      ? "next"
      : endIdx < activeLegIndex
        ? "done"
        : legIdx <= activeLegIndex
          ? "now"
          : "next";
  const firstRideAt = p.rideAt[0] ?? 0;
  const lastRideAt = p.rideAt[p.rideAt.length - 1] ?? itinerary.legs.length - 1;
  return (
    <ol className={`r-jl${dark ? " is-dark" : ""}`}>
      <li className={`r-jl-row is-end is-${stateOf(0, firstRideAt - 1)}`}>
        <span className="r-jl-time r-tnum">{clock(itinerary.departureUnix)}</span>
        <span className="r-jl-rail is-walk is-top">
          <span className="r-jl-dot is-end" />
        </span>
        <span className="r-jl-body">
          <span className="r-jl-name">{p.access.fromName || r("jl.start")}</span>
          {p.access.meters >= 15 ? (
            <span className="r-jl-walk r-tnum">
              <Icon name="person-simple-walk" size={15} />
              {r("jl.walkFact", { d: fmtDist(p.access.meters), m: mins(p.access.sec) })}
            </span>
          ) : null}
        </span>
      </li>
      {p.rides.map((ride, i) => (
        <Fragment key={i}>
          <RideSegment leg={ride} state={stateOf(p.rideAt[i])} dark={dark} />
          {p.changes[i] ? (
            <li
              className={`r-jl-row is-change is-${stateOf(p.changes[i].legIndex, p.rideAt[i + 1] - 1)}`}
            >
              <span className="r-jl-time" />
              <span className="r-jl-rail is-walk" />
              <span className="r-jl-body">
                <ChangeBlock ch={p.changes[i]} dark={dark} />
              </span>
            </li>
          ) : null}
        </Fragment>
      ))}
      {p.egress.meters >= 15 ? (
        <li className={`r-jl-row is-walkrow is-${stateOf(lastRideAt + 1, itinerary.legs.length - 1)}`}>
          <span className="r-jl-time" />
          <span className="r-jl-rail is-walk" />
          <span className="r-jl-body">
            <span className="r-jl-walk r-tnum">
              <Icon name="person-simple-walk" size={15} />
              {r("jl.walkFact", { d: fmtDist(p.egress.meters), m: mins(p.egress.sec) })}
            </span>
          </span>
        </li>
      ) : null}
      <li className={`r-jl-row is-end is-${stateOf(itinerary.legs.length)}`}>
        <span className="r-jl-time r-tnum">{clock(itinerary.arrivalUnix)}</span>
        <span className="r-jl-rail is-walk is-bottom">
          <span className="r-jl-dot is-dest">
            <Icon name="flag-checkered" size={12} />
          </span>
        </span>
        <span className="r-jl-body">
          <span className="r-jl-k">{r("jl.arrive")}</span>
          <span className="r-jl-name">{destLabel || p.egress.toName}</span>
        </span>
      </li>
    </ol>
  );
}

/** Map pin for a change point: white chip with the swap glyph and the next line. */
export function ChangePin({ next }: { next: RideLeg }) {
  const { r } = useRoamI18n();
  return (
    <span className="r-jl-mappin" role="img" aria-label={r("jl.changeTo", { line: next.routeShort })}>
      <Icon name="arrows-left-right" size={13} />
      <LegMark leg={next} size={18} />
      <span className="r-tnum">{next.routeShort}</span>
    </span>
  );
}

/** Map pin for the first stop you board at. */
export function BoardPin({ ride }: { ride: RideLeg }) {
  const { r } = useRoamI18n();
  return (
    <span className="r-jl-mappin is-board" role="img" aria-label={r("jl.getOn")}>
      <LegMark leg={ride} size={18} />
      <span className="r-tnum">{ride.routeShort}</span>
    </span>
  );
}
