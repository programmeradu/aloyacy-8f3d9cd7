// Dark hero card at the top of a route page: what the next run on this line
// is doing right now — boarding at the origin, standing at a stop, in motion,
// or simply scheduled.

import { Link } from "@tanstack/react-router";
import type { BoardStop, BusOnLine, BoardTrip } from "@aloya/core/route-board";
import { useI18n } from "@/lib/i18n";
import { fmtRouteClock, useMinutesFromNow } from "@/lib/route-page";

export function RouteNextDepartureCard({
  trip,
  liveBus,
  atStop,
  nextStop,
  terminus,
}: {
  trip: BoardTrip;
  liveBus: BusOnLine | undefined;
  atStop: BoardStop | undefined;
  nextStop: BoardStop | undefined;
  terminus: BoardStop | undefined;
}) {
  const { t } = useI18n();
  const minutesFromNow = useMinutesFromNow();

  const nextStopName = nextStop?.name ?? t("route.upcomingStop");
  const terminusName = terminus?.name ?? t("route.terminus");

  let kicker = t("route.nextDeparture");
  let kickerTone = "text-limestone/60";
  let bigText = nextStopName;
  let footer = t("route.endsAt", {
    time: fmtRouteClock(trip.nextArrival.arrivalUnix),
    terminus: terminusName,
  });
  let pillText = minutesFromNow(trip.nextArrival.arrivalUnix);

  if (liveBus) {
    if (liveBus.status === "departing") {
      kicker = t("route.aboutToDepart");
      kickerTone = "text-ochre";
      bigText = atStop?.name ?? nextStopName;
      footer = t("route.boardingOrigin", { terminus: terminusName });
      pillText = t("route.boardingPill");
    } else if (liveBus.status === "at") {
      kicker = t("route.busAtStop");
      kickerTone = "text-ochre";
      bigText = atStop?.name ?? nextStopName;
      footer = t("route.doorsOpen", { name: nextStopName });
      pillText = t("route.atStopPill");
    } else {
      const kmh = Math.round(liveBus.speed * 3.6);
      kicker = kmh > 3 ? t("route.busInMotion") : t("route.busEnRoute");
      kickerTone = "text-ochre";
      bigText = t("route.headingTo", { name: nextStopName });
      footer =
        (kmh > 3 ? t("route.kmhPrefix", { kmh }) : "") +
        t("route.arrivingEnds", {
          time: fmtRouteClock(trip.nextArrival.arrivalUnix),
          terminus: terminusName,
        });
      pillText = minutesFromNow(trip.nextArrival.arrivalUnix);
    }
  }

  return (
    <section className="mt-6 px-6 animate-rise" style={{ animationDelay: "160ms" }}>
      <Link
        to="/trip-info/$tripId"
        params={{ tripId: trip.tripId }}
        className="block rounded-[28px] bg-ink text-limestone p-5 ring-1 ring-ink/10 transition-transform active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${kickerTone}`}>
            {liveBus ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex">
                  <span className="size-1.5 rounded-full bg-ochre" />
                  <span className="absolute inset-0 size-1.5 rounded-full bg-ochre animate-ping opacity-70" />
                </span>
                {kicker}
              </span>
            ) : (
              kicker
            )}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">{pillText}</p>
        </div>
        <p className="mt-3 font-display text-[28px] leading-[1.05] text-limestone text-balance">
          {bigText}
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-limestone/70">
          {footer}
        </p>
      </Link>
    </section>
  );
}
