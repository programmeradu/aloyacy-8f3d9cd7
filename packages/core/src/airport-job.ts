// Airport as a job: how to leave, from data we already have.
// Kapnos live seats and price vs the next city bus vs the taxi rank.
// Taxi fare is unpublished — without a destination we do not quote one.
// Luggage and last-coach are not in the product. Do not invent them.

import { BOARDING_PAY, formatEur } from "./boarding-pay";
import { seatLabel, seatPressure } from "./airport-board";

export type AirportCoachDepartIn = {
  depart: string;
  seatsAvailable: number;
  priceFrom?: string | null;
  /** Empty if today; otherwise "tomorrow" or a weekday chip. */
  dayChip?: string;
};

export type AirportCoachIn = {
  destinationCity: string;
  priceFrom?: string | null;
  rideMin?: number;
  nextDepartures: readonly AirportCoachDepartIn[];
};

export type AirportCityBusIn = {
  routeShort: string;
  etaMin: number;
  /** Ghost buses are not a way out. */
  ghost?: boolean;
} | null;

export type AirportCoachWay = {
  kind: "coach";
  destinationCity: string;
  depart: string;
  seatsAvailable: number;
  priceFrom: string | null;
  rideMin?: number;
  dayChip: string;
};

export type AirportCityBusWay = {
  kind: "cityBus";
  routeShort: string;
  etaMin: number;
  motionEur: number;
};

export type AirportTaxiWay = {
  kind: "taxi";
  known: false;
};

export type AirportJob = {
  coaches: AirportCoachWay[];
  nextCoach: AirportCoachWay | null;
  cityBus: AirportCityBusWay | null;
  taxi: AirportTaxiWay;
};

export type AirportWayRow = {
  key: "coach" | "cityBus" | "taxi";
  line: string;
};

function departSortKey(d: { depart: string; dayChip?: string }): number {
  const [hRaw, mRaw] = d.depart.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  const later = d.dayChip && d.dayChip.trim() ? 24 * 60 : 0;
  return later + h * 60 + m;
}

function toCoachWay(line: AirportCoachIn, next: AirportCoachDepartIn): AirportCoachWay {
  return {
    kind: "coach",
    destinationCity: line.destinationCity,
    depart: next.depart,
    seatsAvailable: next.seatsAvailable,
    priceFrom: next.priceFrom ?? line.priceFrom ?? null,
    rideMin: line.rideMin,
    dayChip: next.dayChip ?? "",
  };
}

export function buildAirportJob(input: {
  coachLines: readonly AirportCoachIn[];
  cityBus: AirportCityBusIn;
}): AirportJob {
  const coaches: AirportCoachWay[] = [];
  for (const line of input.coachLines) {
    const next = line.nextDepartures[0];
    if (!next?.depart) continue;
    coaches.push(toCoachWay(line, next));
  }
  coaches.sort((a, b) => departSortKey(a) - departSortKey(b));

  const cityBus: AirportCityBusWay | null =
    input.cityBus && !input.cityBus.ghost && input.cityBus.routeShort.trim()
      ? {
          kind: "cityBus",
          routeShort: input.cityBus.routeShort,
          etaMin: Math.max(0, Math.round(input.cityBus.etaMin)),
          motionEur: BOARDING_PAY.urban.motionEur,
        }
      : null;

  return {
    coaches,
    nextCoach: coaches[0] ?? null,
    cityBus,
    taxi: { kind: "taxi", known: false },
  };
}

export function coachJobDetail(way: AirportCoachWay): string {
  if (seatPressure(way.seatsAvailable) === "sold") return "Sold out";
  const seats = seatLabel(way.seatsAvailable);
  return way.priceFrom ? `${seats}, from ${way.priceFrom}` : seats;
}

export function coachJobLine(way: AirportCoachWay): string {
  return `Coach to ${way.destinationCity} at ${way.depart} — ${coachJobDetail(way)}.`;
}

export function cityBusJobLine(way: AirportCityBusWay): string {
  const fare = formatEur(way.motionEur);
  if (way.etaMin <= 0) return `Bus ${way.routeShort} now. Tap Motion ${fare}.`;
  return `Bus ${way.routeShort} in ${way.etaMin} min. Tap Motion ${fare}.`;
}

export const TAXI_JOB_LINE =
  "Taxi rank outside arrivals. We don't quote a fare we haven't measured.";

export function airportWayRows(job: AirportJob): AirportWayRow[] {
  const rows: AirportWayRow[] = [];
  if (job.nextCoach) rows.push({ key: "coach", line: coachJobLine(job.nextCoach) });
  if (job.cityBus) rows.push({ key: "cityBus", line: cityBusJobLine(job.cityBus) });
  rows.push({ key: "taxi", line: TAXI_JOB_LINE });
  return rows;
}
