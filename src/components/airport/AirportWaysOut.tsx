// How to leave the airport — stacked sentences, not three equal cards.
// Kapnos next coach, first live city bus, taxi rank with no invented fare.

import { useI18n, type DictKey } from "@/lib/i18n";
import { AIRPORT_COPY } from "@/lib/airport-page";
import { formatEur } from "@aloya/core/boarding-pay";
import { seatPressure } from "@aloya/core/airport-board";
import { TAXI_JOB_LINE, type AirportCoachWay, type AirportJob } from "@aloya/core/airport-job";

export function AirportWaysOut({ job, status }: { job: AirportJob; status: string }) {
  const { t, locale } = useI18n();
  const lines = wayLines(job, t, AIRPORT_COPY[locale]);

  return (
    <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="font-display text-[22px] sm:text-[26px] leading-[1.1] text-ink">
          {t("airport.howToLeave")}
        </h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft shrink-0 pb-1">
          {status}
        </span>
      </div>
      <ul className="divide-y divide-line border-y border-line">
        {lines.map((line) => (
          <li key={line} className="py-3 text-[15px] leading-snug text-ink">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

function wayLines(
  job: AirportJob,
  t: (key: DictKey, vars?: Record<string, string | number>) => string,
  copy: (typeof AIRPORT_COPY)["en"],
): string[] {
  const lines: string[] = [];
  if (job.nextCoach) {
    lines.push(
      t("airport.coach", {
        city: job.nextCoach.destinationCity,
        depart: job.nextCoach.depart,
        detail: coachDetail(job.nextCoach, copy),
      }),
    );
  }
  if (job.cityBus) {
    const fare = formatEur(job.cityBus.motionEur);
    lines.push(
      job.cityBus.etaMin <= 0
        ? t("airport.cityBusNow", { route: job.cityBus.routeShort, fare })
        : t("airport.cityBus", {
            route: job.cityBus.routeShort,
            min: job.cityBus.etaMin,
            fare,
          }),
    );
  }
  const taxi = t("airport.taxi");
  lines.push(taxi === "airport.taxi" ? TAXI_JOB_LINE : taxi);
  return lines;
}

function coachDetail(way: AirportCoachWay, copy: (typeof AIRPORT_COPY)["en"]): string {
  if (seatPressure(way.seatsAvailable) === "sold") return copy.sold;
  const seats = copy.seatsLeft(way.seatsAvailable);
  return way.priceFrom ? `${seats}, ${copy.fromLabel} ${way.priceFrom}` : seats;
}
