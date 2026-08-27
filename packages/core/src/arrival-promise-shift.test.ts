import { describe, expect, it } from "vitest";
import {
  shiftHeadline,
  shiftOptionLine,
  shiftOptionName,
  suggestArrivalShift,
  type LadderRung,
} from "./arrival-promise";

const NOW = 1_700_000_000;
const TARGET = NOW + 3600; // arrive in an hour

function rung(over: Partial<LadderRung> & { arrivalUnix: number }): LadderRung {
  return {
    itineraryId: "it-1",
    leaveByUnix: NOW + 300,
    slackSec: TARGET - over.arrivalUnix,
    verdict: "late",
    transfers: 0,
    routes: ["19"],
    recommended: true,
    ...over,
  };
}

describe("suggestArrivalShift", () => {
  it("returns null when an option already lands on time", () => {
    const ladder = [rung({ arrivalUnix: TARGET - 600 })];
    expect(
      suggestArrivalShift({ ladder, targetArrivalUnix: TARGET, margin: "normal", nowUnix: NOW }),
    ).toBeNull();
  });

  it("suggests rounded options that clear the shortfall", () => {
    const ladder = [rung({ arrivalUnix: TARGET + 18 * 60 })];
    const s = suggestArrivalShift({
      ladder,
      targetArrivalUnix: TARGET,
      margin: "normal",
      bufferSec: 300,
      nowUnix: NOW,
    })!;
    expect(s.blind).toBe(false);
    expect(s.shortfallSec).toBe(18 * 60);
    expect(s.reachableArrivalUnix).toBe(TARGET + 18 * 60);
    for (const o of s.options) {
      expect(o.extraSec % 300).toBe(0);
      expect(o.extraSec).toBeGreaterThanOrEqual(18 * 60);
      expect(o.newTargetUnix).toBe(TARGET + o.extraSec);
    }
    // ascending, de-duplicated
    const extras = s.options.map((o) => o.extraSec);
    expect(new Set(extras).size).toBe(extras.length);
    expect([...extras].sort((a, b) => a - b)).toEqual(extras);
    expect(s.recommended?.slackSec).toBeGreaterThan(0);
  });

  it("picks the least-late rung as the reachable arrival", () => {
    const ladder = [
      rung({ itineraryId: "a", arrivalUnix: TARGET + 55 * 60 }),
      rung({ itineraryId: "b", arrivalUnix: TARGET + 12 * 60 }),
    ];
    const s = suggestArrivalShift({
      ladder,
      targetArrivalUnix: TARGET,
      margin: "tight",
      nowUnix: NOW,
    })!;
    expect(s.reachableArrivalUnix).toBe(TARGET + 12 * 60);
    expect(s.shortfallSec).toBe(12 * 60);
  });

  it("falls back to blind steps when the ladder is empty", () => {
    const s = suggestArrivalShift({
      ladder: [],
      targetArrivalUnix: TARGET,
      margin: "normal",
      nowUnix: NOW,
    })!;
    expect(s.blind).toBe(true);
    expect(s.options.map((o) => o.extraSec)).toEqual([15 * 60, 30 * 60, 60 * 60]);
    expect(s.options.every((o) => o.slackSec === null)).toBe(true);
  });

  it("drops options that fall beyond the watch horizon", () => {
    const s = suggestArrivalShift({
      ladder: [],
      targetArrivalUnix: TARGET,
      margin: "normal",
      nowUnix: NOW,
      maxHorizonSec: 3600 + 20 * 60,
    })!;
    expect(s.options.map((o) => o.extraSec)).toEqual([15 * 60]);
  });

  it("caps a wildly unreachable target at the max shift", () => {
    const ladder = [rung({ arrivalUnix: TARGET + 12 * 3600 })];
    const s = suggestArrivalShift({
      ladder,
      targetArrivalUnix: TARGET,
      margin: "relaxed",
      nowUnix: NOW,
    })!;
    expect(s.options).toHaveLength(1);
    expect(s.options[0].extraSec).toBe(4 * 3600);
    expect(s.options[0].verdict).toBe("late");
  });

  it("writes rider-facing copy for the headline and options", () => {
    const ladder = [rung({ arrivalUnix: TARGET + 18 * 60 })];
    const s = suggestArrivalShift({
      ladder,
      targetArrivalUnix: TARGET,
      margin: "normal",
      nowUnix: NOW,
    })!;
    expect(shiftHeadline(s, TARGET)).toContain("18 min past");
    expect(shiftOptionLine(s.options[0])).toMatch(/^\+\d+ min · by \d{2}:\d{2}/);
    expect(shiftOptionName("suggested")).toBe("Recommended");
  });

  it("says so when even the blind steps have no measurement behind them", () => {
    const s = suggestArrivalShift({
      ladder: [],
      targetArrivalUnix: TARGET,
      margin: "normal",
      nowUnix: NOW,
    })!;
    expect(shiftHeadline(s, TARGET)).toContain("No option reaches you by");
  });
});
