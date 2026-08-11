import { describe, expect, it } from "vitest";
import {
  distanceMeters,
  etaFromUnix,
  formatDistance,
  timeOfDayGreeting,
} from "@/lib/format";

const at = (isoLocal: string) => new Date(isoLocal);
const unix = (ms: number) => Math.round(ms / 1000);

describe("etaFromUnix", () => {
  const now = Date.UTC(2026, 4, 12, 9, 0, 0);

  it("reports a bus that already left as gone", () => {
    const result = etaFromUnix(unix(now - 90_000), now);
    expect(result.tier).toBe("past");
    expect(result.label).toBe("Gone");
  });

  it("keeps a bus within the 45s grace window out of the past tier", () => {
    expect(etaFromUnix(unix(now - 30_000), now).tier).toBe("now");
  });

  it("collapses anything under a minute to Now with zero minutes", () => {
    const result = etaFromUnix(unix(now + 59_000), now);
    expect(result).toMatchObject({ label: "Now", minutes: 0, tier: "now" });
  });

  it("counts exact minutes below the ten-minute threshold", () => {
    expect(etaFromUnix(unix(now + 4 * 60_000), now)).toMatchObject({
      label: "4 min",
      minutes: 4,
      tier: "soon",
    });
  });

  it("switches to a zero-padded clock time at ten minutes and beyond", () => {
    const arrival = new Date(now + 11 * 60_000);
    const result = etaFromUnix(unix(arrival.getTime()), now);
    const hh = String(arrival.getHours()).padStart(2, "0");
    const mm = String(arrival.getMinutes()).padStart(2, "0");
    expect(result).toMatchObject({ label: `${hh}:${mm}`, tier: "scheduled" });
    expect(result.label).toHaveLength(5);
  });
});

describe("timeOfDayGreeting", () => {
  it.each([
    ["2026-05-12T06:30:00", "Kalimera"],
    ["2026-05-12T13:00:00", "Kalo mesimeri"],
    ["2026-05-12T18:45:00", "Kalispera"],
    ["2026-05-12T23:30:00", "Kalinychta"],
    ["2026-05-12T03:00:00", "Kalinychta"],
  ])("greets %s with %s", (iso, expected) => {
    expect(timeOfDayGreeting(at(iso))).toBe(expected);
  });

  it.each([
    ["2026-01-01T14:00:00", "Kali chronia"],
    ["2026-01-06T14:00:00", "Kala Fota"],
    ["2026-03-25T14:00:00", "Chronia polla"],
    ["2026-10-01T14:00:00", "Chronia polla"],
    ["2026-12-25T14:00:00", "Kala Christougenna"],
    ["2026-12-31T14:00:00", "Kali protochronia"],
  ])("overrides the hour on the holiday %s", (iso, expected) => {
    expect(timeOfDayGreeting(at(iso))).toBe(expected);
  });

  it("greets the Orthodox Easter weekend with Christos anesti", () => {
    // Orthodox Easter 2026 falls on 12 April.
    for (const day of [11, 12, 13]) {
      expect(timeOfDayGreeting(new Date(2026, 3, day, 10, 0, 0))).toBe(
        "Christos anesti",
      );
    }
    expect(timeOfDayGreeting(new Date(2026, 3, 15, 10, 0, 0))).toBe("Kalimera");
  });
});

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters({ lat: 35.17, lng: 33.36 }, { lat: 35.17, lng: 33.36 })).toBe(0);
  });

  it("matches the known Nicosia to Limassol great-circle distance", () => {
    const d = distanceMeters({ lat: 35.1856, lng: 33.3823 }, { lat: 34.7071, lng: 33.0226 });
    expect(d / 1000).toBeGreaterThan(60);
    expect(d / 1000).toBeLessThan(65);
  });

  it("is symmetric", () => {
    const a = { lat: 34.9, lng: 33.6 };
    const b = { lat: 35.0, lng: 33.7 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [12.4, "12 m"],
    [949, "949 m"],
    [950, "0.9 km"],
    [1000, "1.0 km"],
    [1249, "1.2 km"],
    [12_345, "12.3 km"],
  ])("formats %d metres as %s", (metres, expected) => {
    expect(formatDistance(metres)).toBe(expected);
  });
});
