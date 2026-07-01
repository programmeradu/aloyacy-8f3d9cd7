import { describe, expect, it } from "vitest";

import { getGreeting } from "./greeting";

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h, 0, 0);

describe("time-of-day greeting", () => {
  it("says kalimera in the morning", () => {
    expect(getGreeting(at(2026, 2, 10, 5)).word).toBe("Kalimera.");
    expect(getGreeting(at(2026, 2, 10, 11)).word).toBe("Kalimera.");
  });

  it("says kalo mesimeri in the afternoon", () => {
    expect(getGreeting(at(2026, 2, 10, 12)).word).toBe("Kalo mesimeri.");
    expect(getGreeting(at(2026, 2, 10, 16)).word).toBe("Kalo mesimeri.");
  });

  it("says kalispera in the evening", () => {
    expect(getGreeting(at(2026, 2, 10, 17)).word).toBe("Kalispera.");
    expect(getGreeting(at(2026, 2, 10, 21)).word).toBe("Kalispera.");
  });

  it("says kalinychta overnight", () => {
    expect(getGreeting(at(2026, 2, 10, 22)).word).toBe("Kalinychta.");
    expect(getGreeting(at(2026, 2, 10, 3)).word).toBe("Kalinychta.");
  });
});

describe("holiday greetings", () => {
  it("overrides the time of day on new year", () => {
    const g = getGreeting(at(2026, 1, 1, 23));
    expect(g.word).toBe("Kali chronia.");
    expect(g.note).toBe("Happy new year");
  });

  it("covers Cyprus Independence Day", () => {
    expect(getGreeting(at(2026, 10, 1)).note).toBe("Cyprus Independence");
  });

  it("covers the whole Christmas window", () => {
    for (const d of [24, 25, 26]) {
      expect(getGreeting(at(2026, 12, d)).word).toBe("Kala Christougenna.");
    }
    expect(getGreeting(at(2026, 12, 27)).word).not.toBe("Kala Christougenna.");
  });

  it("greets Orthodox Easter across the Saturday-to-Monday window", () => {
    // Orthodox Easter 2026 falls on 12 April.
    for (const d of [11, 12, 13]) {
      expect(getGreeting(at(2026, 4, d)).word, `April ${d}`).toBe("Christos anesti.");
    }
    expect(getGreeting(at(2026, 4, 15)).word).not.toBe("Christos anesti.");
  });

  it("always returns a non-empty word", () => {
    for (let month = 1; month <= 12; month++) {
      const g = getGreeting(at(2026, month, 15, 13));
      expect(g.word.length, `month ${month}`).toBeGreaterThan(0);
    }
  });
});
