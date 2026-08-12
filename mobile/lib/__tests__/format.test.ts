import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistance, timeOfDayGreeting } from "../format";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters({ lat: 35.17, lng: 33.36 }, { lat: 35.17, lng: 33.36 })).toBe(0);
  });

  it("matches a known Nicosia → Limassol separation within 1%", () => {
    const m = distanceMeters({ lat: 35.1856, lng: 33.3823 }, { lat: 34.7071, lng: 33.0226 });
    expect(m).toBeGreaterThan(60_000);
    expect(m).toBeLessThan(64_000);
  });

  it("is symmetric", () => {
    const a = { lat: 34.9, lng: 33.6 };
    const b = { lat: 35.0, lng: 33.7 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe("formatDistance", () => {
  it("uses whole metres below the kilometre threshold", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(12.4)).toBe("12 m");
    expect(formatDistance(949)).toBe("949 m");
  });

  it("switches to one-decimal kilometres at 950 m", () => {
    expect(formatDistance(950)).toBe("0.9 km");
    expect(formatDistance(1500)).toBe("1.5 km");
    expect(formatDistance(62_000)).toBe("62.0 km");
  });
});

describe("timeOfDayGreeting", () => {
  const at = (iso: string) => timeOfDayGreeting(new Date(iso));

  it("covers each part of the day", () => {
    expect(at("2026-09-15T06:00:00")).toBe("Kalimera");
    expect(at("2026-09-15T13:00:00")).toBe("Kalo mesimeri");
    expect(at("2026-09-15T18:30:00")).toBe("Kalispera");
    expect(at("2026-09-15T23:30:00")).toBe("Kalinychta");
    expect(at("2026-09-15T03:00:00")).toBe("Kalinychta");
  });

  it("handles the boundaries inclusively at the lower edge", () => {
    expect(at("2026-09-15T05:00:00")).toBe("Kalimera");
    expect(at("2026-09-15T11:59:00")).toBe("Kalimera");
    expect(at("2026-09-15T12:00:00")).toBe("Kalo mesimeri");
    expect(at("2026-09-15T17:00:00")).toBe("Kalispera");
    expect(at("2026-09-15T22:00:00")).toBe("Kalinychta");
  });

  it("overrides fixed-date Cypriot holidays regardless of the hour", () => {
    expect(at("2026-01-01T14:00:00")).toBe("Kali chronia");
    expect(at("2026-01-06T08:00:00")).toBe("Kala Fota");
    expect(at("2026-03-25T20:00:00")).toBe("Chronia polla");
    expect(at("2026-10-28T09:00:00")).toBe("Chronia polla");
    expect(at("2026-12-25T09:00:00")).toBe("Kala Christougenna");
    expect(at("2026-12-31T09:00:00")).toBe("Kali protochronia");
  });

  it("greets Orthodox Easter across its three-day window", () => {
    // Orthodox Easter 2026 falls on 12 April.
    expect(at("2026-04-11T10:00:00")).toBe("Christos anesti");
    expect(at("2026-04-12T10:00:00")).toBe("Christos anesti");
    expect(at("2026-04-13T10:00:00")).toBe("Christos anesti");
    expect(at("2026-04-14T10:00:00")).toBe("Kalimera");
  });
});
