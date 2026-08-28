import { describe, expect, it } from "vitest";
import { WALK_M_PER_S } from "./geo";
import {
  destBailForWait,
  destBailLine,
  estimateWalk,
  estimateWalkMin,
  pickDestBail,
  WALK_BEATS_WAIT_MIN,
  WALK_DETOUR,
  WALK_MAX_MIN,
} from "./dest-bail";
import { multileg as destBailEn } from "./dictionaries/en/multileg";

describe("estimateWalk", () => {
  it("uses the planner pace, not a guessed speed", () => {
    expect(WALK_M_PER_S).toBe(1.35);
    expect(WALK_DETOUR).toBe(1.3);
    expect(WALK_MAX_MIN).toBe(25);
    expect(WALK_BEATS_WAIT_MIN).toBe(2);
    const a = { lat: 35.17, lng: 33.36 };
    const b = { lat: 35.174, lng: 33.364 };
    const walk = estimateWalk(a, b);
    expect(walk).not.toBeNull();
    expect(walk!.min).toBe(estimateWalkMin(a, b));
    expect(walk!.meters).toBeGreaterThan(0);
  });

  it("stays silent on a walk longer than 25 min", () => {
    expect(estimateWalkMin({ lat: 35.17, lng: 33.36 }, { lat: 34.68, lng: 33.04 })).toBeNull();
  });

  it("stays silent on broken coordinates", () => {
    expect(estimateWalkMin({ lat: Number.NaN, lng: 33 }, { lat: 35, lng: 33 })).toBeNull();
  });
});

describe("pickDestBail", () => {
  const base = {
    dark: true,
    destLabel: "Home",
    routeShort: "31",
    walkMin: 8,
    waitMin: 14,
  };

  it("says walk when walking is clearly faster than waiting for a ghost", () => {
    expect(pickDestBail(base)).toEqual({
      kind: "walk",
      walkMin: 8,
      waitMin: 14,
      destLabel: "Home",
      routeShort: "31",
    });
  });

  it("keeps waiting when the walk is not faster by the margin", () => {
    expect(pickDestBail({ ...base, walkMin: 8, waitMin: 9 })).toEqual({
      kind: "keepWait",
      walkMin: 8,
      waitMin: 9,
      routeShort: "31",
    });
  });

  it("stays quiet when the bus is live, or we cannot measure the walk", () => {
    expect(pickDestBail({ ...base, dark: false })).toBeNull();
    expect(pickDestBail({ ...base, walkMin: null })).toBeNull();
    expect(pickDestBail({ ...base, routeShort: "  " })).toBeNull();
  });
});

describe("destBailForWait", () => {
  const nicosia = { lat: 35.172, lng: 33.365 };
  const nearby = { lat: 35.174, lng: 33.367 };

  it("while walking to the stop, only speaks if walking to dest wins", () => {
    const walk = destBailForWait({
      dark: true,
      phase: "walking",
      waitMin: 20,
      from: nicosia,
      to: nearby,
      destLabel: "Home",
      routeShort: "31",
    });
    expect(walk?.kind).toBe("walk");
    const keep = destBailForWait({
      dark: true,
      phase: "walking",
      waitMin: 2,
      from: nicosia,
      to: nearby,
      destLabel: "Home",
      routeShort: "31",
    });
    expect(keep).toBeNull();
  });

  it("while waiting, will say keep-waiting when the walk is longer", () => {
    const hit = destBailForWait({
      dark: true,
      phase: "waiting",
      waitMin: 4,
      from: nicosia,
      to: nearby,
      destLabel: "Home",
      routeShort: "31",
    });
    expect(hit?.kind).toBe("keepWait");
  });

  it("does not speak on other phases", () => {
    expect(
      destBailForWait({
        dark: true,
        phase: "other",
        waitMin: 20,
        from: nicosia,
        to: nearby,
        destLabel: "Home",
        routeShort: "31",
      }),
    ).toBeNull();
  });
});

describe("destBailLine", () => {
  it("prints the walk and the wait, with no taxi euro and no luggage", () => {
    expect(
      destBailLine({
        kind: "walk",
        walkMin: 8,
        waitMin: 14,
        destLabel: "Home",
        routeShort: "31",
      }),
    ).toBe("Walk to Home in 8 min. Bus 31 isn't on the map.");
    expect(destBailLine({ kind: "keepWait", walkMin: 18, waitMin: 6, routeShort: "31" })).toBe(
      "Walking is 18 min. Bus 31 is about 6 min if it shows.",
    );
    expect(destBailLine({ kind: "keepWait", walkMin: 18, waitMin: 0, routeShort: "31" })).toBe(
      "Walking is 18 min. Bus 31 isn't on the map.",
    );
    const all = [
      destBailLine({
        kind: "walk",
        walkMin: 8,
        waitMin: 14,
        destLabel: "Home",
        routeShort: "31",
      }),
      destBailLine({ kind: "keepWait", walkMin: 18, waitMin: 6, routeShort: "31" }),
    ].join(" ");
    expect(all).not.toMatch(/€|luggage|last.?coach|exact change/i);
    expect(destBailEn["ml.destBail.walk"]).toBe(
      "Walk to {dest} in {min} min. Bus {route} isn't on the map.",
    );
    expect(destBailEn["ml.destBail.keepWait"]).toBe(
      "Walking is {walk} min. Bus {route} is about {wait} min if it shows.",
    );
  });
});
