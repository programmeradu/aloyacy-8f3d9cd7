import { describe, expect, it } from "vitest";
import {
  COMB_BASE_PX,
  COMB_MIN_PX,
  COMB_RANGE_PX,
  combBars,
  flowSegments,
  flowSummary,
  hasActivity,
  totalSamples,
} from "./pulse-flow";

const strip = (counts: number[]) => counts.map((sampleCount) => ({ sampleCount }));

describe("flowSummary", () => {
  it("reads a median inside half a minute as on-time in either direction", () => {
    expect(flowSummary(0)).toEqual({ kind: "onTime" });
    expect(flowSummary(24)).toEqual({ kind: "onTime" });
    expect(flowSummary(-24)).toEqual({ kind: "onTime" });
  });

  it("crosses into lateness once the median rounds up to a minute", () => {
    expect(flowSummary(44)).toEqual({ kind: "late", minutes: 1 });
    expect(flowSummary(-44)).toEqual({ kind: "early", minutes: 1 });
  });

  it("rounds lateness to whole minutes", () => {
    expect(flowSummary(150)).toEqual({ kind: "late", minutes: 3 });
  });

  it("reports earliness as a positive magnitude", () => {
    expect(flowSummary(-200)).toEqual({ kind: "early", minutes: 3 });
  });
});

describe("combBars", () => {
  it("gives empty hours a hairline and marks the current hour", () => {
    const bars = combBars(strip([0, 10, 0]), 2);
    expect(bars[0]).toMatchObject({ height: COMB_MIN_PX, isEmpty: true, isNow: false });
    expect(bars[1].height).toBe(COMB_BASE_PX + COMB_RANGE_PX);
    expect(bars[2]).toMatchObject({ isEmpty: true, isNow: true });
  });

  it("scales against the day's own peak, not an absolute ceiling", () => {
    const quiet = combBars(strip([1, 2]), 0);
    const busy = combBars(strip([500, 1000]), 0);
    expect(quiet[1].height).toBe(busy[1].height);
  });

  it("survives a strip of only zeros without dividing by zero", () => {
    const bars = combBars(strip([0, 0, 0]), 1);
    expect(bars.every((b) => b.height === COMB_MIN_PX)).toBe(true);
  });

  it("keeps one bar per hour", () => {
    expect(combBars(strip(Array(24).fill(3)), 5)).toHaveLength(24);
  });
});

describe("hasActivity / totalSamples", () => {
  it("hides an all-zero strip", () => {
    expect(hasActivity(strip([0, 0]))).toBe(false);
    expect(hasActivity([])).toBe(false);
    expect(hasActivity(strip([0, 1]))).toBe(true);
  });

  it("sums samples and ignores negative noise", () => {
    expect(totalSamples(strip([3, 4, -2]))).toBe(7);
  });
});

describe("flowSegments", () => {
  it("normalises rounded percentages back to 100", () => {
    const s = flowSegments(34, 34, 34);
    expect(s.late + s.onTime + s.early).toBeCloseTo(100, 6);
  });

  it("returns an empty bar when there is no signal", () => {
    expect(flowSegments(0, 0, 0)).toEqual({ late: 0, onTime: 0, early: 0 });
  });

  it("drops nonsense values instead of drawing negative widths", () => {
    const s = flowSegments(-5, 100, Number.NaN);
    expect(s).toEqual({ late: 0, onTime: 100, early: 0 });
  });
});
