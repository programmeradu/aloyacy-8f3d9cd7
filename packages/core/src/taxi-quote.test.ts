import { describe, expect, it } from "vitest";
import {
  formatTaxiBand,
  pickTaxiBail,
  taxiBailLine,
  taxiDoorLine,
  taxiNightAt,
  taxiQuoteFromDrive,
  taxiTelDisplay,
  TAXI_DISPATCHER_TEL,
  TAXI_MIN_DRIVE_M,
  TAXI_MIN_DRIVE_SEC,
} from "./taxi-quote";

const DAY_UNIX = Math.floor(Date.UTC(2024, 5, 10, 12, 0, 0) / 1000); // ~15:00 Cyprus
const NIGHT_UNIX = Math.floor(Date.UTC(2024, 5, 10, 21, 30, 0) / 1000); // ~00:30 Cyprus

const drive = { distanceMeters: 2500, durationSec: 400 };

describe("taxiNightAt", () => {
  it("uses Cyprus hours, not UTC", () => {
    expect(taxiNightAt(DAY_UNIX)).toBe(false);
    expect(taxiNightAt(NIGHT_UNIX)).toBe(true);
  });
});

describe("taxiQuoteFromDrive", () => {
  it("stays silent without a measured drive", () => {
    expect(taxiQuoteFromDrive(null, false)).toBeNull();
    expect(
      taxiQuoteFromDrive({ distanceMeters: 2500, durationSec: TAXI_MIN_DRIVE_SEC - 1 }, false),
    ).toBeNull();
    expect(
      taxiQuoteFromDrive({ distanceMeters: TAXI_MIN_DRIVE_M - 1, durationSec: 200 }, false),
    ).toBeNull();
  });

  it("does not invent a euro from a haversine — needs meters and seconds", () => {
    const q = taxiQuoteFromDrive(drive, false);
    expect(q).not.toBeNull();
    expect(q!.driveMin).toBe(7);
    expect(q!.night).toBe(false);
    expect(q!.tel).toBe(TAXI_DISPATCHER_TEL);
    expect(q!.fareLow).toBe(5);
    expect(q!.fareHigh).toBe(6.5);
  });

  it("uses the night per-km on a Cyprus night hour", () => {
    const day = taxiQuoteFromDrive(drive, false)!;
    const night = taxiQuoteFromDrive(drive, true)!;
    expect(night.fareHigh).toBeGreaterThan(day.fareHigh);
  });

  it("never prices below the €5 minimum", () => {
    const q = taxiQuoteFromDrive({ distanceMeters: 700, durationSec: 120 }, false);
    expect(q!.fareLow).toBeGreaterThanOrEqual(5);
  });
});

describe("formatTaxiBand", () => {
  it("prints a 50c band, whole euros from 10", () => {
    expect(formatTaxiBand(5, 6.5)).toBe("€5–€6.5");
    expect(formatTaxiBand(28, 38)).toBe("€28–€38");
  });
});

describe("taxiTelDisplay", () => {
  it("prints the Cyprus dispatcher the way a rider would dial it", () => {
    expect(taxiTelDisplay()).toBe("77 777 474");
  });
});

describe("pickTaxiBail", () => {
  const quote = taxiQuoteFromDrive(drive, false)!;
  const base = {
    dark: true,
    phase: "waiting" as const,
    waitMin: 22,
    walkPossible: false,
    destLabel: "Home",
    routeShort: "31",
    quote,
  };

  it("names the taxi when the walk is too far and the bus is dark", () => {
    const hit = pickTaxiBail(base);
    expect(hit?.kind).toBe("taxi");
    expect(taxiBailLine(hit!)).toBe(
      "Taxi to Home in 7 min, €5–€6.5. Bus 31 is about 22 min if it shows.",
    );
    expect(taxiBailLine(hit!)).not.toMatch(/haversine|luggage|RAPTOR/i);
  });

  it("stays quiet when a walk is possible — we do not sell a taxi over a walk", () => {
    expect(pickTaxiBail({ ...base, walkPossible: true })).toBeNull();
  });

  it("stays quiet when the bus is live, or we have no quote", () => {
    expect(pickTaxiBail({ ...base, dark: false })).toBeNull();
    expect(pickTaxiBail({ ...base, quote: null })).toBeNull();
    expect(pickTaxiBail({ ...base, phase: "other" })).toBeNull();
  });
});

describe("taxiDoorLine", () => {
  it("prints fare, drive and the dispatcher, and nothing we have not measured", () => {
    const q = taxiQuoteFromDrive({ distanceMeters: 40_000, durationSec: 2100 }, false)!;
    const line = taxiDoorLine(q, "Nicosia");
    expect(line).toMatch(/^Taxi to Nicosia in \d+ min, €\d/);
    expect(line).toContain("Call 77 777 474");
    expect(line).not.toMatch(/luggage|last coach|haversine/i);
  });
});
