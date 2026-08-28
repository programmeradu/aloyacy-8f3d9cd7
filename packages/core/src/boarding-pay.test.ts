import { describe, expect, it } from "vitest";
import { BOARDING_PAY, boardingPayKind, boardingPayLine, formatEur } from "./boarding-pay";

describe("boardingPayKind", () => {
  it("names urban operators and the intercity feed", () => {
    expect(boardingPayKind({ agency: "NPT" })).toBe("urban");
    expect(boardingPayKind({ agency: "FAM" })).toBe("urban");
    expect(boardingPayKind({ agency: "IC" })).toBe("intercity");
    expect(boardingPayKind({ feedId: 6 })).toBe("intercity");
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
  it("prints the ministry amounts, not a rounded guess", () => {
    expect(BOARDING_PAY.urban.motionEur).toBe(1.8);
    expect(BOARDING_PAY.urban.paperEur).toBe(2.4);
    expect(BOARDING_PAY.intercity.motionEur).toBe(6);
    expect(BOARDING_PAY.intercity.paperEur).toBe(8);
    expect(formatEur(1.8)).toBe("€1.80");
    expect(formatEur(6)).toBe("€6");
    expect(boardingPayLine("urban")).toBe("Tap Motion €1.80, or pay the driver €2.40.");
    expect(boardingPayLine("intercity")).toBe("Tap Motion €6, or pay the driver €8.");
    expect(boardingPayLine("urban")).not.toMatch(/wait/i);
    expect(boardingPayLine("intercity")).not.toMatch(/exact change/i);
  });
});
