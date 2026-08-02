// The full stop sequence of a line, with live bus markers threaded into the
// timeline where a bus is standing at or approaching a stop.

import { Link } from "@tanstack/react-router";
import type { BoardStop, RouteBoard } from "@aloya/core/route-board";
import { IconBus } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

export function RouteStopsList({
  board,
  stopOf,
}: {
  board: RouteBoard;
  stopOf: (id: string) => BoardStop | undefined;
}) {
  const { t } = useI18n();
  const last = board.stopIds.length - 1;

  return (
    <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "240ms" }}>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">{t("route.stopsOnThis")}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("route.stopsCount", { n: board.stopIds.length })}
        </span>
      </div>
      <ol className="rounded-[28px] bg-card ring-1 ring-line overflow-hidden">
        {board.stopIds.map((id, i) => {
          const s = stopOf(id);
          if (!s) return null;
          const isEdge = i === 0 || i === last;
          const busHere = board.busesOnLine.find(
            (b) => b.stopIndex === i && (b.status === "at" || b.status === "departing"),
          );
          const busApproaching = board.busesOnLine.find(
            (b) => b.stopIndex === i && b.status === "approaching",
          );
          const liveLabel = busHere
            ? busHere.status === "departing"
              ? t("route.busDepartingNow")
              : t("route.busAtThisStop")
            : busApproaching
              ? t("route.busApproaching")
              : null;
          return (
            <Link
              key={id}
              to="/stop/$stopId"
              params={{ stopId: id }}
              className={`relative flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 transition-colors hover:bg-limestone-soft/60 ${
                liveLabel ? "bg-ochre/5" : ""
              }`}
            >
              <div className="relative flex flex-col items-center">
                {busHere ? (
                  <span className="relative flex size-4 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-ochre/30 animate-ping" />
                    <span className="relative flex size-4 items-center justify-center rounded-full bg-ochre ring-2 ring-limestone">
                      <IconBus className="size-2.5 text-ink" />
                    </span>
                  </span>
                ) : busApproaching ? (
                  <span className="relative flex size-3 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-ochre/40 animate-ping" />
                    <span className="relative size-2.5 rounded-full bg-ochre ring-2 ring-limestone" />
                  </span>
                ) : (
                  <span
                    className={`size-2.5 rounded-full ${isEdge ? "bg-ochre" : "bg-aegean-deep/70"}`}
                  />
                )}
                {i < last && <span className="absolute top-4 h-12 w-px bg-line" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] leading-tight text-ink truncate">{s.name}</p>
                <p
                  className={`mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] truncate ${
                    liveLabel ? "text-ochre" : "text-ink-soft"
                  }`}
                >
                  {liveLabel ?? (
                    <>
                      {i === 0
                        ? t("route.origin")
                        : i === last
                          ? t("route.terminus")
                          : t("route.stopN", { n: i + 1 })}
                      {s.code ? ` — #${s.code}` : ""}
                    </>
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </ol>
    </section>
  );
}
