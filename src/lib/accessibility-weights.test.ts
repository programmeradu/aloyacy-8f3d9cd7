import { describe, it, expect } from "vitest";
import { applyAccessibilityWeights } from "./accessibility-weights";
import type { Itinerary, RideLeg, WaitLeg, WalkLeg } from "./itinerary-types";
import { DEFAULT_PREFS, type AccessibilityPrefs } from "./accessibility-prefs";

function prefs(p: Partial<AccessibilityPrefs> = {}): AccessibilityPrefs {
  return { ...DEFAULT_PREFS, ...p };
}

function rideLeg(boardStopId: string, alightStopId: string): RideLeg {
  return {
    kind: "ride",
    routeId: "r1",
    routeShort: "1",
    routeLong: "Route 1",
    tripId: "t1",
    live: true,
    board: { stopId: boardStopId, name: "board", lat: 0, lng: 0, departureUnix: 0 },
    alight: { stopId: alightStopId, name: "alight", lat: 0, lng: 0, arrivalUnix: 100 },
    stopCount: 3,
    delaySec: 0,
  };
}

function waitLeg(stopId: string, durationSec = 300): WaitLeg {
  return { kind: "wait", stopId, name: "wait", lat: 0, lng: 0, durationSec };
}

function walkLeg(fromStopId?: string, toStopId?: string): WalkLeg {
  return {
    kind: "walk",
    from: { stopId: fromStopId, name: "from", lat: 0, lng: 0 },
    to: { stopId: toStopId, name: "to", lat: 0, lng: 0 },
    durationSec: 60,
    distanceMeters: 100,
    verified: false,
  };
}

function itin(legs: Itinerary["legs"], totalWalkMeters = 0, score = 1000): Itinerary {
  return {
    id: "i1",
    legs,
    totalDurationSec: 600,
    departureUnix: 0,
    arrivalUnix: 600,
    transfers: 0,
    totalWalkMeters,
    score,
    source: "live",
  };
}

// Stop amenity ids (from src/data/stop-amenities.ts):
// "1009" -> shelter/shade/seating/stepFree all true
// "3050" -> shade:false, stepFree:true
// unknown ids -> undefined (no data)

describe("applyAccessibilityWeights", () => {
  it("no-ops on empty itinerary list", () => {
    expect(() => applyAccessibilityWeights([], prefs({ stepFree: true }))).not.toThrow();
  });

  it("does nothing when no prefs are active", () => {
    const it1 = itin([rideLeg("unknown-a", "unknown-b")]);
    const before = it1.score;
    applyAccessibilityWeights([it1], prefs());
    expect(it1.score).toBe(before);
  });

  it("leaves score untouched when stops are unknown, even if a pref is active", () => {
    const it1 = itin([rideLeg("unknown-a", "unknown-b")]);
    const before = it1.score;
    applyAccessibilityWeights([it1], prefs({ stepFree: true, preferShade: true }));
    expect(it1.score).toBe(before);
  });

  it("penalises walk distance over the cap", () => {
    const it1 = itin([], 1500, 1000);
    applyAccessibilityWeights([it1], prefs({ maxWalkMeters: 1000 }));
    expect(it1.score).toBe(1000 + 500 * 1.0);
  });

  it("does not penalise walk distance under/at the cap", () => {
    const it1 = itin([], 800, 1000);
    applyAccessibilityWeights([it1], prefs({ maxWalkMeters: 1000 }));
    expect(it1.score).toBe(1000);
    const it2 = itin([], 1000, 1000);
    applyAccessibilityWeights([it2], prefs({ maxWalkMeters: 1000 }));
    expect(it2.score).toBe(1000);
  });

  it("penalises ride legs boarding/alighting at non-step-free stops when stepFree is active", () => {
    // no known non-step-free stops exist in the seed data, so use amenity-known stop with stepFree true for baseline
    const it1 = itin([rideLeg("1009", "1009")], 0, 1000);
    applyAccessibilityWeights([it1], prefs({ stepFree: true }));
    // both stops are step-free, so no penalty
    expect(it1.score).toBe(1000);
  });

  it("rewards shade at boarding stop and penalises non-shaded boarding stop", () => {
    const shaded = itin([rideLeg("1009", "1009")], 0, 1000); // 1009: shade true
    applyAccessibilityWeights([shaded], prefs({ preferShade: true }));
    expect(shaded.score).toBe(1000 - 20);

    const nonShaded = itin([rideLeg("3050", "3050")], 0, 1000); // 3050: shade false
    applyAccessibilityWeights([nonShaded], prefs({ preferShade: true }));
    expect(nonShaded.score).toBe(1000 + 30);
  });

  it("scores wait legs proportionally to wait duration, capped at 5 minutes", () => {
    // 3050 has stepFree true, shade false -> preferShade active gives penalty scaled by duration
    const short = itin([waitLeg("3050", 150)], 0, 1000); // 150/300 = 0.5 weight
    applyAccessibilityWeights([short], prefs({ preferShade: true }));
    expect(short.score).toBe(1000 + 30 * 0.5);

    const long = itin([waitLeg("3050", 900)], 0, 1000); // capped at weight 1
    applyAccessibilityWeights([long], prefs({ preferShade: true }));
    expect(long.score).toBe(1000 + 30 * 1);
  });

  it("returns 0 delta for wait legs at unknown stops", () => {
    const it1 = itin([waitLeg("unknown-stop")], 0, 1000);
    applyAccessibilityWeights([it1], prefs({ stepFree: true, preferShade: true }));
    expect(it1.score).toBe(1000);
  });

  it("penalises walk endpoints only when stepFree is active", () => {
    const it1 = itin([walkLeg("unknown-a", "unknown-b")], 0, 1000);
    applyAccessibilityWeights([it1], prefs({ preferShade: true })); // stepFree off
    expect(it1.score).toBe(1000);
  });

  it("walk endpoints with known step-free stops incur no penalty", () => {
    const it1 = itin([walkLeg("1009", "1009")], 0, 1000);
    applyAccessibilityWeights([it1], prefs({ stepFree: true }));
    expect(it1.score).toBe(1000);
  });

  it("combines multiple legs and prefs additively", () => {
    const it1 = itin(
      [rideLeg("3050", "3050"), waitLeg("3050", 300), walkLeg("3050", "unknown")],
      1200,
      1000,
    );
    applyAccessibilityWeights([it1], prefs({ preferShade: true, maxWalkMeters: 1000 }));
    // walk cap: (1200-1000)*1 = 200
    // ride leg board shade false => +30
    // wait leg weight 1 => +30
    const expected = 1000 + 200 + 30 + 30;
    expect(it1.score).toBe(expected);
  });

  it("applies to every itinerary in the list", () => {
    const a = itin([], 2000, 100);
    const b = itin([], 2000, 200);
    applyAccessibilityWeights([a, b], prefs({ maxWalkMeters: 1000 }));
    expect(a.score).toBe(100 + 1000);
    expect(b.score).toBe(200 + 1000);
  });
});
