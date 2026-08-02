// "Today's runs" — the later trips on this line, after the hero card.

import { Link } from "@tanstack/react-router";
import type { BoardStop, RouteBoard } from "@aloya/core/route-board";
import { IconBus } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { fmtRouteClock, useMinutesFromNow } from "@/lib/route-page";

export function RouteRunsList({
  board,
  stopOf,
}: {
  board: RouteBoard;
  stopOf: (id: string) => BoardStop | undefined;
}) {
  const { t } = useI18n();
  const minutesFromNow = useMinutesFromNow();

  return (
    <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "200ms" }}>
      <div className="flex items-end justify-between mb-3">
        <h2 className="font-display text-2xl text-ink">{t("route.todaysRuns")}</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t("route.fromLive")}
        </span>
      </div>
      <ol className="rounded-[28px] bg-card ring-1 ring-line overflow-hidden">
        {board.trips.slice(1, 6).map((trip) => {
          const live = board.vehicles.some((v) => v.tripId === trip.tripId);
          return (
            <Link
              key={trip.tripId}
              to="/trip-info/$tripId"
              params={{ tripId: trip.tripId }}
              className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0 transition-colors hover:bg-limestone-soft/60"
            >
              <div className="font-display text-2xl text-ink tabular-nums w-16">
                {fmtRouteClock(trip.nextArrival.arrivalUnix)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] leading-tight text-ink truncate">
                  {stopOf(trip.nextArrival.stopId)?.name ?? t("route.nextStop")}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                  {live && <IconBus className="size-3 text-ochre" />}
                  {live ? t("route.liveNow") : t("route.scheduled")}
                  {" — "}
                  {t("route.toName", {
                    name:
                      stopOf(trip.lastStop.stopId)
                        ?.name.split(/[·\-,]/)[0]
                        .trim() ?? t("route.terminus"),
                  })}
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {minutesFromNow(trip.nextArrival.arrivalUnix)}
              </span>
            </Link>
          );
        })}
      </ol>
    </section>
  );
}
