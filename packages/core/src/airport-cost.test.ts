import { describe, expect, it } from "vitest";
import { BOARDING_PAY } from "./boarding-pay";
import { buildAirportJob } from "./airport-job";
import {
  airportDest,
  cityBusDoorLine,
  destJobLines,
  doorFromItinerary,
  parseAirportSearch,
  parseEur,
  pickCoachForDest,
  waitMinFromDepart,
} from "./airport-cost";
import { taxiQuoteFromDrive } from "./taxi-quote";

function coach(city: string, depart: string, seats = 12, price = "€8") {
  return {
    destinationCity: city,
    priceFrom: price,
    nextDepartures: [{ depart, seatsAvailable: seats, priceFrom: price, dayChip: "" }],
  };
}

describe("parseAirportSearch", () => {
  it("accepts a Cyprus dest and rejects a guess outside the island", () => {
    expect(parseAirportSearch({ toLat: "35.17", toLng: "33.36", toLabel: "Nicosia" })).toEqual({
      toLat: 35.17,
      toLng: 33.36,
      toLabel: "Nicosia",
    });
    expect(parseAirportSearch({ toLat: 51.5, toLng: -0.1, toLabel: "London" })).toEqual({});
    expect(airportDest(parseAirportSearch({ toLat: 35.17, toLng: 33.36 }))?.label).toBe("your door");
  });
});

describe("pickCoachForDest", () => {
  it("picks the coach that actually goes there, not the soonest other city", () => {
    const job = buildAirportJob({
      coachLines: [coach("Limassol", "13:00"), coach("Nicosia", "14:20")],
      cityBus: null,
    });
    expect(pickCoachForDest(job.coaches, "Ledra Street, Nicosia")?.destinationCity).toBe("Nicosia");
    expect(pickCoachForDest(job.coaches, "Λευκωσία")?.destinationCity).toBe("Nicosia");
    expect(pickCoachForDest(job.coaches, "Paphos")).toBeNull();
  });
});

describe("destJobLines", () => {
  it("prints fare, wait and walk, and does not invent a taxi euro", () => {
    const now = Date.UTC(2026, 7, 28, 10, 0, 0); // 13:00 Cyprus in August
    const job = buildAirportJob({
      coachLines: [coach("Nicosia", "14:20")],
      cityBus: { routeShort: "425", etaMin: 6 },
    });
    const wait = waitMinFromDepart("14:20", now);
    expect(wait).toBeGreaterThan(0);
    expect(parseEur("€8")).toBe(8);
    const lines = destJobLines({
      job,
      destLabel: "Nicosia",
      nowMs: now,
      coachWalkMin: 8,
      busDoor: {
        routeShort: "456",
        waitMin: 12,
        walkMin: 14,
        fareEur: BOARDING_PAY.urban.motionEur,
      },
    });
    expect(lines[0]).toBe(`Coach to Nicosia at 14:20 — €8, ${wait} min wait, 8 min walk.`);
    expect(lines[1]).toBe(cityBusDoorLine({
      routeShort: "456",
      fareEur: 2.0,
      waitMin: 12,
      walkMin: 14,
      destLabel: "Nicosia",
    }));
    expect(lines[1]).toBe("Bus 456: €2.00, 12 min wait, 14 min walk to Nicosia.");
    expect(lines[2]).not.toMatch(/€/);
    expect(lines.join(" ")).not.toMatch(/luggage|last coach|RAPTOR/i);
  });

  it("prints a taxi euro only from a measured drive", () => {
    const quote = taxiQuoteFromDrive({ distanceMeters: 40_000, durationSec: 2100 }, false);
    expect(quote).not.toBeNull();
    const now = Date.UTC(2026, 7, 28, 10, 0, 0);
    const job = buildAirportJob({
      coachLines: [coach("Nicosia", "14:20")],
      cityBus: { routeShort: "425", etaMin: 6 },
    });
    const lines = destJobLines({
      job,
      destLabel: "Nicosia",
      nowMs: now,
      taxiQuote: quote,
    });
    expect(lines.at(-1)).toMatch(/^Taxi to Nicosia in \d+ min, €\d/);
    expect(lines.at(-1)).toContain("Call 77 777 474");
  });

  it("reads wait and walk from a RAPTOR itinerary", () => {
    const nowUnix = 1_700_000_000;
    const door = doorFromItinerary(
      {
        totalWalkMeters: 810,
        legs: [
          { kind: "walk" },
          { kind: "ride", routeShort: "425", board: { departureUnix: nowUnix + 12 * 60 } },
        ],
      },
      nowUnix,
    );
    expect(door).toEqual({ routeShort: "425", waitMin: 12, walkMin: 10 });
  });
});
