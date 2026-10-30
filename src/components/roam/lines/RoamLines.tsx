// Lines tab: search lines and stops, operator filters, the live network
// card, saved (starred) lines with live status, then every line.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPreview } from "@/components/MapPreview";
import { ROUTES, STOPS, NICOSIA_CENTER } from "@/lib/gtfs";
import { useRealtime } from "@/lib/useRealtime";
import { useStarredRoutes } from "@/lib/route-favorites";
import { useRoamI18n, type RoamKey } from "@/lib/roam-i18n";
import { RoamPage } from "../RoamPage";
import { FrostButton } from "../FrostButton";
import { NotchCard } from "../NotchCard";
import { Icon } from "../Icon";
import { ConfTag, LinePill } from "../bits";
import { openMeSheet } from "../me-store";
import {
  filterLines,
  lineRows,
  matchStops,
  OPERATOR_KEYS,
  splitLong,
  type Operator,
} from "./lines-data";

const ALL_ROWS = lineRows(ROUTES, Array.from(new Set(STOPS.map((s) => s.name))));
const FILTERS: { op: Operator; key: RoamKey }[] = [
  { op: "all", key: "lines.all" },
  { op: "NPT", key: OPERATOR_KEYS.NPT },
  { op: "IC", key: OPERATOR_KEYS.IC },
  { op: "kapnos", key: "lines.kapnos" },
  { op: "nextbike", key: "lines.nextbike" },
  { op: "LMS", key: OPERATOR_KEYS.LMS },
  { op: "LCA", key: OPERATOR_KEYS.LCA },
  { op: "PFO", key: OPERATOR_KEYS.PFO },
  { op: "FAM", key: OPERATOR_KEYS.FAM },
];

function agencyIcon(agency: string) {
  return agency === "IC" ? "bus" : "bus";
}

export function RoamLines() {
  const { r } = useRoamI18n();
  const [op, setOp] = useState<Operator>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const { data: rt } = useRealtime();
  const starred = useStarredRoutes();

  const liveRoutes = useMemo(() => new Set((rt?.vehicles ?? []).map((v) => v.routeId)), [rt]);
  const rows = useMemo(() => filterLines(ALL_ROWS, op, q), [op, q]);
  const stops = useMemo(() => matchStops(STOPS, q), [q]);
  const saved = Object.values(starred)
    .sort((a, b) => b.starredAt - a.starredAt)
    .map((s) => {
      const route = ROUTES.find((x) => x.id === s.routeId);
      return route ? { ...s, ...splitLong(route.long), agency: route.agency } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const liveCount = rt?.vehicles.length ?? 0;
  const showKapnos = op === "all" || op === "kapnos";
  const showBike = op === "nextbike";

  return (
    <RoamPage
      title={r("lines.title")}
      right={
        <FrostButton
          icon="bell-simple"
          variant="light"
          label={r("me.alerts")}
          onClick={() => openMeSheet("alerts")}
        />
      }
    >
      <label className="r-card flex items-center gap-3 px-[18px] h-[52px]">
        <Icon name="magnifying-glass" size={20} />
        <span className="sr-only">{r("lines.search")}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={r("lines.search")}
          className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--r-mute)]"
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>

      <div className="r-hscroll mt-4" role="group" aria-label={r("lines.title")}>
        {FILTERS.map((f) => (
          <button
            key={f.op}
            type="button"
            className={`r-pill${op === f.op ? " r-pill--k" : " r-pill--o"}`}
            aria-pressed={op === f.op}
            onClick={() => setOp(f.op)}
          >
            {r(f.key)}
          </button>
        ))}
      </div>

      {!q && op === "all" ? (
        <NotchCard
          fill="#262626"
          className="mt-5"
          shadow="drop-shadow(0 14px 28px rgba(0,0,0,.16))"
          notches={[
            {
              edge: "bottom",
              cx: 150,
              width: 104,
              depth: 24,
              dock: (
                <Link
                  to="/pulse"
                  className="r-fb r-fb--white r-fb--lg"
                  aria-label={r("lines.openNetwork")}
                >
                  <Icon name="arrow-up-right" />
                </Link>
              ),
            },
          ]}
          underlay={
            <div className="r-lines-map" style={{ position: "absolute", inset: 0 }}>
              <MapPreview
                bare
                center={NICOSIA_CENTER}
                spanKm={9}
                liveVehicles
                fitToContent={false}
                attribBottom={8}
                logoCorner="top-left"
              />
              <div
                className="r-shade-top"
                style={{
                  height: "100%",
                  background:
                    "linear-gradient(200deg,rgba(0,0,0,.55),rgba(0,0,0,0) 50%,rgba(0,0,0,.15))",
                }}
              />
            </div>
          }
        >
          <div className="h-[186px] relative" style={{ pointerEvents: "none" }}>
            <div className="absolute right-5 top-[18px] text-right">
              <div className="text-white text-[18px] font-medium r-scrim-text">
                {r("lines.networkNow")}
              </div>
              {liveCount > 0 ? (
                <span className="r-pill r-pill--glass mt-2" style={{ height: 28, fontSize: 13 }}>
                  <span className="r-dot" />
                  {r("lines.busesLive", { n: liveCount })}
                </span>
              ) : null}
            </div>
          </div>
        </NotchCard>
      ) : null}

      {q && stops.length > 0 ? (
        <div className="r-card mt-5" style={{ padding: "4px 0" }}>
          {stops.map((s) => (
            <Link
              key={`${s.agency}:${s.id}`}
              to="/stop/$stopId"
              params={{ stopId: s.id }}
              className="r-row"
            >
              <span className="r-icobox">
                <Icon name="map-pin" />
              </span>
              <span className="flex-1 min-w-0 text-[16px] font-medium truncate">{s.name}</span>
              <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
            </Link>
          ))}
        </div>
      ) : null}

      {!q && op === "all" && saved.length > 0 ? (
        <>
          <h2 className="r-sec-lbl">{r("lines.saved")}</h2>
          <div className="r-card" style={{ padding: "2px 0" }}>
            {saved.map((s) => (
              <LineRowLink
                key={s.routeId}
                routeId={s.routeId}
                short={s.routeShort}
                dest={s.dest}
                sub={s.origin}
                live={liveRoutes.has(s.routeId)}
              />
            ))}
          </div>
        </>
      ) : null}

      {showKapnos && !q ? (
        <div className="r-card mt-5" style={{ padding: "2px 0" }}>
          <Link to="/airport/$code" params={{ code: "LCA" }} className="r-row r-line-row">
            <span className="r-line-pill">
              <LinePill line="Kapnos" icon="airplane-tilt" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium truncate">{r("lines.kapnosRow")}</span>
              <span className="r-lbl block truncate">{r("lines.kapnosSub")}</span>
            </span>
            <ConfTag kind="tt" />
          </Link>
        </div>
      ) : null}

      {showBike ? (
        <div className="r-card mt-5" style={{ padding: "2px 0" }}>
          <Link to="/trips" className="r-row r-line-row">
            <span className="r-line-pill">
              <LinePill line="Nextbike" icon="bicycle" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[16px] font-medium truncate">
                {r("lines.nextbikeRow")}
              </span>
              <span className="r-lbl block truncate">{r("lines.nextbikeSub")}</span>
            </span>
            <Icon name="caret-right" size={16} style={{ color: "var(--r-mute)" }} />
          </Link>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <h2 className="r-sec-lbl">
            {op === "all" ? r("lines.allLines") : r(FILTERS.find((f) => f.op === op)!.key)}
          </h2>
          <div className="r-card" style={{ padding: "2px 0" }}>
            {rows.slice(0, limit).map((row) => (
              <LineRowLink
                key={`${row.agency}${row.short}`}
                routeId={row.routeId}
                short={row.short}
                dest={row.dest}
                sub={row.origin}
                live={liveRoutes.has(row.routeId)}
                icon={agencyIcon(row.agency)}
              />
            ))}
          </div>
          {rows.length > limit ? (
            <button
              type="button"
              className="r-pill r-pill--w r-pill--lg mx-auto mt-4 flex"
              onClick={() => setLimit((n) => n + 60)}
            >
              {r("go.seeAll")} · {rows.length}
            </button>
          ) : null}
        </>
      ) : q && stops.length === 0 ? (
        <p className="r-lbl text-center mt-10">{r("lines.noResults")}</p>
      ) : null}
    </RoamPage>
  );
}

function LineRowLink({
  routeId,
  short,
  dest,
  sub,
  live,
  icon = "bus",
}: {
  routeId: string;
  short: string;
  dest: string;
  sub: string | null;
  live: boolean;
  icon?: string;
}) {
  const { r } = useRoamI18n();
  return (
    <Link to="/route/$routeId" params={{ routeId }} className="r-row r-line-row">
      <span className="r-line-pill">
        <LinePill line={short} icon={icon} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-medium truncate">{dest}</span>
        {sub ? (
          <span className="r-lbl block truncate">{r("lines.from", { place: sub })}</span>
        ) : null}
      </span>
      <ConfTag kind={live ? "live" : "tt"} />
    </Link>
  );
}
