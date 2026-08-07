// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShortcutDetector } from "../useShortcutDetector";
import type { ActiveTrip } from "../trip-store";
import type { LiveFix } from "../useGeoWatch";

function makeActive(startedAt = 1): ActiveTrip {
  return {
    startedAt,
    option: { id: "o1" } as ActiveTrip["option"],
    from: { lat: 0, lng: 0, label: "home" },
    to: { lat: 0, lng: 0, label: "dest" },
    itinerary: { legs: [] } as unknown as ActiveTrip["itinerary"],
  };
}

function fixAt(lat: number, lng: number): LiveFix {
  return { lat, lng, accuracyM: 5, speedMps: 1, headingDeg: 0, timestamp: Date.now() };
}

describe("useShortcutDetector", () => {
  it("does not prompt without a fix or active trip", () => {
    const { result } = renderHook(() =>
      useShortcutDetector({ active: null, fix: null, currentLegIndex: 0, isOnFinalWalk: false }),
    );
    expect(result.current.shouldPrompt).toBe(false);
    expect(result.current.distanceM).toBe(Infinity);
  });

  it("does not prompt while on the final walk", () => {
    const active = makeActive();
    const { result } = renderHook(() =>
      useShortcutDetector({ active, fix: fixAt(0, 0), currentLegIndex: 0, isOnFinalWalk: true }),
    );
    expect(result.current.shouldPrompt).toBe(false);
  });

  it("prompts once distance is close and decreasing over 3 fixes", () => {
    let fix = fixAt(0.002, 0);
    const { result, rerender } = renderHook(
      (props: { fix: LiveFix }) =>
        useShortcutDetector({
          active: makeActive(),
          fix: props.fix,
          currentLegIndex: 0,
          isOnFinalWalk: false,
        }),
      { initialProps: { fix } },
    );
    expect(result.current.shouldPrompt).toBe(false); // only 1 sample so far

    fix = fixAt(0.0015, 0);
    rerender({ fix });
    expect(result.current.shouldPrompt).toBe(false); // only 2 samples

    fix = fixAt(0.001, 0);
    rerender({ fix });
    rerender({ fix }); // flush the history-append effect from the previous render
    expect(result.current.shouldPrompt).toBe(true);
  });

  it("does not prompt when distance is increasing (moving away)", () => {
    let fix = fixAt(0.001, 0);
    const { result, rerender } = renderHook(
      (props: { fix: LiveFix }) =>
        useShortcutDetector({
          active: makeActive(),
          fix: props.fix,
          currentLegIndex: 0,
          isOnFinalWalk: false,
        }),
      { initialProps: { fix } },
    );
    fix = fixAt(0.0015, 0);
    rerender({ fix });
    fix = fixAt(0.002, 0);
    rerender({ fix });
    expect(result.current.shouldPrompt).toBe(false);
  });

  it("does not prompt once beyond the trigger distance", () => {
    const fix = fixAt(1, 1); // far away
    const { result } = renderHook(() =>
      useShortcutDetector({
        active: makeActive(),
        fix,
        currentLegIndex: 0,
        isOnFinalWalk: false,
      }),
    );
    expect(result.current.shouldPrompt).toBe(false);
  });

  it("dismiss() suppresses future prompts until a new trip starts", () => {
    let fix = fixAt(0.002, 0);
    const { result, rerender } = renderHook(
      (props: { fix: LiveFix; active: ActiveTrip }) =>
        useShortcutDetector({
          active: props.active,
          fix: props.fix,
          currentLegIndex: 0,
          isOnFinalWalk: false,
        }),
      { initialProps: { fix, active: makeActive(1) } },
    );
    fix = fixAt(0.0015, 0);
    rerender({ fix, active: makeActive(1) });
    fix = fixAt(0.001, 0);
    rerender({ fix, active: makeActive(1) });
    rerender({ fix, active: makeActive(1) }); // flush the history-append effect
    expect(result.current.shouldPrompt).toBe(true);

    result.current.dismiss();
    rerender({ fix, active: makeActive(1) });
    expect(result.current.shouldPrompt).toBe(false);

    // A new trip (different startedAt) resets dismissal.
    rerender({ fix, active: makeActive(2) });
    expect(result.current.shouldPrompt).toBe(false); // history reset, needs 3 fresh samples
  });

  it("returns 0/Infinity distance gracefully without crashing when itinerary missing", () => {
    const active = { ...makeActive(), itinerary: undefined };
    const { result } = renderHook(() =>
      useShortcutDetector({ active, fix: fixAt(0, 0), currentLegIndex: 0, isOnFinalWalk: false }),
    );
    expect(result.current.shouldPrompt).toBe(false);
  });
});
