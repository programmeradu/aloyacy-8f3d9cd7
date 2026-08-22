import { describe, expect, it } from "vitest";

import { ETA_STATUS_LABEL, fmtBand, fmtClock, fmtEta, fmtEtaMin, PHASE_COPY } from "./journey-copy";
import type { JourneyPhase } from "./journey-phase";

describe("fmtEta", () => {
  it("rounds seconds to whole minutes", () => {
    expect(fmtEta(0)).toBe("0 min");
    expect(fmtEta(29)).toBe("0 min");
    expect(fmtEta(31)).toBe("1 min");
    expect(fmtEta(600)).toBe("10 min");
  });

  it("never renders a negative ETA for a bus that is already late", () => {
    expect(fmtEta(-120)).toBe("0 min");
  });
});

describe("fmtEtaMin", () => {
  it("rounds and clamps minute inputs", () => {
    expect(fmtEtaMin(4.4)).toBe("4 min");
    expect(fmtEtaMin(4.6)).toBe("5 min");
    expect(fmtEtaMin(-3)).toBe("0 min");
  });
});

describe("fmtBand", () => {
  it("renders a range with an en dash", () => {
    expect(fmtBand(8, 12)).toBe("8\u201312 min");
  });

  it("collapses an equal band to a single value", () => {
    expect(fmtBand(7, 7)).toBe("7 min");
    expect(fmtBand(7.2, 6.9)).toBe("7 min");
  });

  it("never shows an inverted band", () => {
    expect(fmtBand(10, 2)).toBe("10 min");
  });

  it("clamps a negative lower bound", () => {
    expect(fmtBand(-5, 3)).toBe("0\u20133 min");
  });
});

describe("fmtClock", () => {
  it("renders a zero-padded 24-hour time", () => {
    const unix = Math.floor(new Date(2026, 0, 5, 7, 4, 0).getTime() / 1000);
    expect(fmtClock(unix)).toBe("07:04");
  });

  it("never uses an AM/PM suffix", () => {
    const unix = Math.floor(new Date(2026, 0, 5, 18, 30, 0).getTime() / 1000);
    expect(fmtClock(unix)).toBe("18:30");
  });
});

describe("copy tables", () => {
  it("labels every ETA status", () => {
    expect(Object.keys(ETA_STATUS_LABEL).sort()).toEqual([
      "live",
      "predicted",
      "scheduled",
      "stale",
    ]);
  });

  it("has non-empty headline copy for every journey phase", () => {
    for (const [phase, copy] of Object.entries(PHASE_COPY) as [JourneyPhase, string][]) {
      expect(copy.length, phase).toBeGreaterThan(0);
    }
  });
});
