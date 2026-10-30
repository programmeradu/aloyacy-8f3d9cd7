// Line detail stop timeline (Roam, concept 07): times down the left, a yellow
// line for the stretch the next bus has covered, filled dots for stops behind
// it, rings ahead, and the live bus threaded in as a yellow pill.
import { Link } from "@tanstack/react-router";
import type { BoardStop, BoardTrip, BusOnLine } from "@aloya/core/route-board";
import { Icon } from "@/components/roam/Icon";
import { useRoamI18n } from "@/lib/roam-i18n";

const hhmm = (unix: number) =>
  new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Nicosia",
  });

export function RouteTimeline({
  stopIds,
  stopOf,
  trip,
  bus,
  lineShort,
}: {
  stopIds: string[];
  stopOf: (id: string) => BoardStop | undefined;
  trip: BoardTrip | undefined;
  bus: BusOnLine | undefined;
  lineShort: string;
}) {
  const { r } = useRoamI18n();
  const times = new Map<string, number>();
  for (const a of trip?.arrivals ?? [])
    if (!times.has(a.stopId)) times.set(a.stopId, a.arrivalUnix);
  const busIdx = bus ? bus.stopIndex : -1;
  const nowSec = Date.now() / 1000;

  return (
    <ol className="r-tl" aria-label={r("line.stopsLabel", { n: stopIds.length })}>
      {stopIds.map((id, i) => {
        const s = stopOf(id);
        if (!s) return null;
        const passed = busIdx >= 0 && i <= busIdx;
        const at = times.get(id);
        const busRow = i === busIdx && bus;
        const nextName = stopOf(stopIds[Math.min(i + 1, stopIds.length - 1)])?.name ?? s.name;
        const nextAt = times.get(stopIds[i + 1] ?? "");
        const mins = nextAt ? Math.max(0, Math.round((nextAt - nowSec) / 60)) : null;
        return (
          <li key={id} className={`r-tl-row${passed ? " is-passed" : ""}`}>
            <Link to="/stop/$stopId" params={{ stopId: id }} className="r-tl-link">
              <span className="r-tl-time r-tnum">{at ? hhmm(at) : ""}</span>
              <span className="r-tl-rail" aria-hidden="true">
                <span className="r-tl-dot" />
              </span>
              <span className="r-tl-name">{s.name}</span>
            </Link>
            {busRow && (
              <div className="r-tl-bus">
                <span className="r-tl-time" />
                <span className="r-tl-rail" aria-hidden="true">
                  <span className="r-tl-busicon">
                    <Icon name="bus" />
                  </span>
                </span>
                <span className="r-pill r-pill--y r-tl-buspill">
                  {bus.status === "at"
                    ? r("line.busAt", { line: lineShort })
                    : mins != null
                      ? r("line.busNext", { line: lineShort, min: mins, stop: nextName })
                      : r("line.busTo", { line: lineShort, stop: nextName })}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
