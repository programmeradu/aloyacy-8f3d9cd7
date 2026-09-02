// How to leave the airport — stacked sentences, not three equal cards.
// Kapnos next coach, first live city bus, taxi rank with no invented fare.
// With a dest: fare + wait + walk for the coach that goes there and RAPTOR.

import { useI18n, type DictKey } from "@/lib/i18n";
import { AIRPORT_COPY } from "@/lib/airport-page";
import { formatEur } from "@aloya/core/boarding-pay";
import { seatPressure } from "@aloya/core/airport-board";
import { TAXI_JOB_LINE, type AirportCoachWay, type AirportJob } from "@aloya/core/airport-job";
import {
  parseEur,
  pickCoachForDest,
  waitMinFromDepart,
  type AirportDest,
} from "@aloya/core/airport-cost";
import type { AirportDoor } from "./useAirportDoor";

export function AirportWaysOut({
  job,
  status,
  dest,
  door,
}: {
  job: AirportJob;
  status: string;
  dest?: AirportDest | null;
  door?: AirportDoor | null;
}) {
  const { t, locale } = useI18n();
  const lines = dest
    ? destLines(job, dest, door ?? null, t)
    : wayLines(job, t, AIRPORT_COPY[locale]);
  const title = dest ? t("airport.howToLeaveTo", { dest: dest.label }) : t("airport.howToLeave");

  return (
    <section className="mt-8 px-6 animate-rise" style={{ animationDelay: "180ms" }}>
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="font-display text-[22px] sm:text-[26px] leading-[1.1] text-ink">{title}</h2>
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

function destLines(
  job: AirportJob,
  dest: AirportDest,
  door: AirportDoor | null,
  t: (key: DictKey, vars?: Record<string, string | number>) => string,
): string[] {
  const lines: string[] = [];
  const coach = pickCoachForDest(job.coaches, dest.label);
  if (coach) {
    const extra = Boolean(coach.dayChip && coach.dayChip.trim());
    const parsed = parseEur(coach.priceFrom);
    const fare = parsed != null ? formatEur(parsed) : (coach.priceFrom ?? "unpublished");
    const wait = waitMinFromDepart(coach.depart, Date.now(), extra);
    const walk = door?.coachWalkMin;
    lines.push(
      walk != null && walk > 0
        ? t("airport.coachDoor", { city: coach.destinationCity, depart: coach.depart, fare, wait, walk })
        : t("airport.coachDoorNoWalk", { city: coach.destinationCity, depart: coach.depart, fare, wait }),
    );
  }
  if (door?.busDoor) {
    const b = door.busDoor;
    lines.push(
      t("airport.cityBusDoor", {
        route: b.routeShort,
        fare: formatEur(b.fareEur),
        wait: b.waitMin,
        walk: b.walkMin,
        dest: dest.label,
      }),
    );
  } else if (job.cityBus) {
    lines.push(...cityBusPlain(job, t));
  }
  const taxi = t("airport.taxi");
  lines.push(taxi === "airport.taxi" ? TAXI_JOB_LINE : taxi);
  return lines;
}

function cityBusPlain(
  job: AirportJob,
  t: (key: DictKey, vars?: Record<string, string | number>) => string,
): string[] {
  if (!job.cityBus) return [];
  const fare = formatEur(job.cityBus.motionEur);
  return [
    job.cityBus.etaMin <= 0
      ? t("airport.cityBusNow", { route: job.cityBus.routeShort, fare })
      : t("airport.cityBus", { route: job.cityBus.routeShort, min: job.cityBus.etaMin, fare }),
  ];
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
  lines.push(...cityBusPlain(job, t));
  const taxi = t("airport.taxi");
  lines.push(taxi === "airport.taxi" ? TAXI_JOB_LINE : taxi);
  return lines;
}

function coachDetail(way: AirportCoachWay, copy: (typeof AIRPORT_COPY)["en"]): string {
  if (seatPressure(way.seatsAvailable) === "sold") return copy.sold;
  const seats = copy.seatsLeft(way.seatsAvailable);
  return way.priceFrom ? `${seats}, ${copy.fromLabel} ${way.priceFrom}` : seats;
}
