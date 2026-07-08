import { describe, expect, it } from "vitest";
import { remainingMinutesToDestination, type DurationLeg } from "./multileg-eta";

const legs: DurationLeg[] = [
  { durationSec: 300 }, // walk
  { durationSec: 900 }, // ride
  { durationSec: 120 }, // walk
  { durationSec: 600 }, // ride
];

describe("remainingMinutesToDestination", () => {
  it("prefers the live alight estimate over the scheduled duration", () => {
    const out = remainingMinutesToDestination(
      { currentLegIndex: 1, secsToCurrentAlight: 60, currentLegDurationSec: 900 },
      legs,
    );
    // 60s live + 120s + 600s = 780s → 13 min
    expect(out).toBe(13);
  });

  it("falls back to the scheduled duration when there is no live value", () => {
    const out = remainingMinutesToDestination(
      { currentLegIndex: 1, secsToCurrentAlight: null, currentLegDurationSec: 900 },
      legs,
    );
    expect(out).toBe(27);
  });

  it("ignores non-finite live values", () => {
    const out = remainingMinutesToDestination(
      { currentLegIndex: 2, secsToCurrentAlight: Number.NaN, currentLegDurationSec: 120 },
      legs,
    );
    expect(out).toBe(12);
  });

  it("floors negative durations to zero instead of rewinding the ETA", () => {
    const out = remainingMinutesToDestination({ currentLegIndex: 0, secsToCurrentAlight: -500 }, [
      { durationSec: 300 },
      { durationSec: -900 },
      { durationSec: 600 },
    ]);
    expect(out).toBe(10);
  });

  it("returns zero on the last leg with nothing remaining", () => {
    expect(
      remainingMinutesToDestination({ currentLegIndex: 3, secsToCurrentAlight: 0 }, legs),
    ).toBe(0);
  });

  it("skips legs with a missing duration", () => {
    expect(
      remainingMinutesToDestination({ currentLegIndex: 0, currentLegDurationSec: 60 }, [
        { durationSec: 60 },
        {},
        { durationSec: 240 },
      ]),
    ).toBe(5);
  });

  it("handles an empty itinerary", () => {
    expect(remainingMinutesToDestination({ currentLegIndex: 0 }, [])).toBe(0);
  });
});
