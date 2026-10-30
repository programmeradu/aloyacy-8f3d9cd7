import { describe, expect, it } from "vitest";
import {
  BOARDING_PAY,
  boardingPayKind,
  boardingPayLine,
  formatEur,
  isCyprusNight,
} from "./boarding-pay";
import { cyWallToMs } from "./cy-time";

describe("boardingPayKind", () => {
  it("names urban operators and the intercity feed", () => {
    expect(boardingPayKind({ agency: "NPT" })).toBe("urban");
    expect(boardingPayKind({ agency: "FAM" })).toBe("urban");
    expect(boardingPayKind({ agency: "IC" })).toBe("intercity");
    expect(boardingPayKind({ feedId: 5 })).toBe("intercity");
    expect(boardingPayKind({ feedId: 6 })).toBe("urban");
    expect(boardingPayKind({ feedId: 2 })).toBe("urban");
    expect(boardingPayKind({ short: "IC4" })).toBe("intercity");
  });

  it("stays quiet on Pame and on unknown routes", () => {
    expect(boardingPayKind({ agency: "SPC" })).toBeNull();
    expect(boardingPayKind({ short: "31" })).toBeNull();
    expect(boardingPayKind({})).toBeNull();
  });
});

describe("boardingPayLine", () => {
  it("prints the official 3 August 2026 ministry amounts", () => {
    expect(BOARDING_PAY.urban.day.motionEur).toBe(2.0);
    expect(BOARDING_PAY.urban.day.paperEur).toBe(2.7);
    expect(BOARDING_PAY.urban.night.motionEur).toBe(3.5);
    expect(BOARDING_PAY.urban.night.paperEur).toBe(4.7);
    expect(BOARDING_PAY.intercity.minEur).toBe(5.0);
    expect(BOARDING_PAY.intercity.maxEur).toBe(8.0);
    expect(BOARDING_PAY.intercity.cashOnly).toBe(true);

    expect(formatEur(2.7)).toBe("€2.70");
    expect(formatEur(2, true)).toBe("€2.00");
    expect(formatEur(6)).toBe("€6");

    const dayMs = cyWallToMs(2026, 8, 20, 14, 0);
    const nightMs = cyWallToMs(2026, 8, 20, 22, 30);
    const lateNightMs = cyWallToMs(2026, 8, 21, 2, 0);

    expect(isCyprusNight(dayMs)).toBe(false);
    expect(isCyprusNight(nightMs)).toBe(true);
    expect(isCyprusNight(lateNightMs)).toBe(true);

    expect(boardingPayLine("urban", dayMs)).toBe("Tap Motion €2.00, or pay the driver €2.70.");
    expect(boardingPayLine("urban", nightMs)).toBe("Tap Motion €3.50, or pay the driver €4.70.");
    expect(boardingPayLine("intercity")).toBe("€5.00–€8.00 by distance, cash only.");
    expect(boardingPayLine("urban", dayMs)).not.toMatch(/wait/i);
    expect(boardingPayLine("intercity")).not.toMatch(/exact change/i);
  });
});
