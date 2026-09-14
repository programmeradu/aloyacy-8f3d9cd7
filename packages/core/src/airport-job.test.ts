import { describe, expect, it } from "vitest";
import { BOARDING_PAY, formatEur } from "./boarding-pay";
import { airport as airportEn } from "./dictionaries/en/airport";
import {
  TAXI_JOB_LINE,
  airportWayRows,
  buildAirportJob,
  cityBusJobLine,
  coachJobLine,
} from "./airport-job";

function coach(
  city: string,
  depart: string,
  seats: number,
  extra?: { price?: string | null; dayChip?: string; linePrice?: string | null },
) {
  return {
    destinationCity: city,
    priceFrom: extra?.linePrice ?? extra?.price ?? "€8",
    nextDepartures: [
      {
        depart,
        seatsAvailable: seats,
        priceFrom: extra?.price ?? "€8",
        dayChip: extra?.dayChip ?? "",
      },
    ],
  };
}

describe("buildAirportJob", () => {
  it("picks the soonest coach today, not a later city or tomorrow", () => {
    const job = buildAirportJob({
      coachLines: [
        coach("Limassol", "16:00", 20),
        coach("Nicosia", "14:20", 12),
        coach("Ayia Napa", "08:00", 9, { dayChip: "tomorrow" }),
      ],
      cityBus: { routeShort: "425", etaMin: 6 },
    });
    expect(job.nextCoach?.destinationCity).toBe("Nicosia");
    expect(job.nextCoach?.depart).toBe("14:20");
    expect(job.coaches.map((c) => c.destinationCity)).toEqual(["Nicosia", "Limassol", "Ayia Napa"]);
  });

  it("skips a coach line with no upcoming departure", () => {
    const job = buildAirportJob({
      coachLines: [{ destinationCity: "Paphos", priceFrom: "€11", nextDepartures: [] }],
      cityBus: null,
    });
    expect(job.nextCoach).toBeNull();
    expect(job.coaches).toEqual([]);
  });

  it("skips a ghost city bus — that is not a way out", () => {
    const job = buildAirportJob({
      coachLines: [],
      cityBus: { routeShort: "425", etaMin: 4, ghost: true },
    });
    expect(job.cityBus).toBeNull();
  });

  it("stamps the urban Motion fare, not a guess, and leaves taxi unknown", () => {
    const job = buildAirportJob({
      coachLines: [],
      cityBus: { routeShort: "612", etaMin: 3.4 },
    });
    expect(job.cityBus?.motionEur).toBe(BOARDING_PAY.urban.motionEur);
    expect(job.cityBus?.etaMin).toBe(3);
    expect(job.taxi.known).toBe(false);
  });
});

describe("airport way copy", () => {
  it("prints Kapnos seats and price, the urban Motion fare, and no taxi euro", () => {
    const job = buildAirportJob({
      coachLines: [coach("Nicosia", "14:20", 12, { price: "€8" })],
      cityBus: { routeShort: "425", etaMin: 6 },
    });
    expect(coachJobLine(job.nextCoach!)).toBe("Coach to Nicosia at 14:20 — 12 seats, from €8.");
    expect(cityBusJobLine(job.cityBus!)).toBe("Bus 425 in 6 min. Tap Motion €2.00.");
    expect(formatEur(BOARDING_PAY.urban.motionEur, true)).toBe("€2.00");
    expect(TAXI_JOB_LINE).toBe(
      "Taxi rank outside arrivals. We don't quote a fare we haven't measured.",
    );
    expect(TAXI_JOB_LINE).not.toMatch(/€/);
    const lines = airportWayRows(job).map((r) => r.line);
    expect(lines).toEqual([
      "Coach to Nicosia at 14:20 — 12 seats, from €8.",
      "Bus 425 in 6 min. Tap Motion €2.00.",
      TAXI_JOB_LINE,
    ]);
    expect(lines.join(" ")).not.toMatch(/luggage|last coach|exact change|wait/i);
    expect(airportEn["airport.taxi"]).toBe(TAXI_JOB_LINE);
    expect(airportEn["airport.cityBus"]).toBe("Bus {route} in {min} min. Tap Motion {fare}.");
    expect(airportEn["airport.coach"]).toBe("Coach to {city} at {depart} — {detail}.");
  });

  it("says sold out without a price, and now when the bus is due", () => {
    const job = buildAirportJob({
      coachLines: [coach("Limassol", "15:00", 0)],
      cityBus: { routeShort: "612", etaMin: 0 },
    });
    expect(coachJobLine(job.nextCoach!)).toBe("Coach to Limassol at 15:00 — Sold out.");
    expect(cityBusJobLine(job.cityBus!)).toBe("Bus 612 now. Tap Motion €2.00.");
  });

  it("still names the taxi rank when nothing else is running", () => {
    const rows = airportWayRows(buildAirportJob({ coachLines: [], cityBus: null }));
    expect(rows).toEqual([{ key: "taxi", line: TAXI_JOB_LINE }]);
  });
});
