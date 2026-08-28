import { describe, expect, it } from "vitest";
import { WALK_M_PER_S } from "./geo";
import {
  destBailForFlipAlert,
  destBailForWait,
  destBailFlipCopy,
  destBailFlipLine,
  destBailLine,
  destBailWithHeadway,
  EMPTY_WAIT_FLIP_HOLD,
  estimateWalk,
  estimateWalkMin,
  nextWaitFlip,
  pickDestBail,
  tickWaitFlip,
  WAIT_FLIP_HOLD_SEC,
  WALK_BEATS_WAIT_MIN,
  WALK_DETOUR,
  WALK_MAX_MIN,
  waitFlipPhase,
  type DestBail,
} from "./dest-bail";
import { cyClock } from "./cy-time";
import { multileg as destBailEn } from "./dictionaries/en/multileg";
import { stop as stopEn } from "./dictionaries/en/stop";

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

describe("destBailWithHeadway", () => {
  const keep: DestBail = { kind: "keepWait", walkMin: 8, waitMin: 14, routeShort: "31" };
  const walk: DestBail = {
    kind: "walk",
    walkMin: 8,
    waitMin: 14,
    destLabel: "Home",
    routeShort: "31",
  };
  const beforeUnix = Date.parse("2026-08-28T18:05:00+03:00") / 1000;
  const hint = { chancePct: 70, beforeUnix };

  it("stamps B2 chance onto keep-wait, never onto walk", () => {
    const stamped = destBailWithHeadway(keep, hint);
    expect(stamped).toMatchObject({ kind: "keepWait", chancePct: 70, beforeUnix });
    expect(destBailWithHeadway(walk, hint)).toEqual(walk);
    expect(destBailWithHeadway(keep, { chancePct: null, beforeUnix })).toEqual(keep);
    expect(destBailWithHeadway(null, hint)).toBeNull();
  });

  it("uses the stop card's chance clause, not a second number", () => {
    const line = destBailLine(destBailWithHeadway(keep, hint)!);
    const time = cyClock(beforeUnix * 1000);
    expect(line).toBe(
      `Walking is 8 min. Bus 31 is about 14 min if it shows. About 70% chance one arrives before ${time}.`,
    );
    expect(stopEn["stop.headwayChance"]).toBe("About {pct}% chance one arrives before {time}.");
    expect(destBailEn["ml.destBail.keepWaitChance"]).toBe(
      "Walking is {walk} min. Bus {route} is about {wait} min if it shows. About {pct}% chance one arrives before {time}.",
    );
    expect(destBailEn["ml.destBail.keepWaitDueChance"]).toBe(
      "Walking is {walk} min. Bus {route} isn't on the map. About {pct}% chance one arrives before {time}.",
    );
    expect(line).not.toMatch(/€|luggage|RAPTOR|taxi/i);
  });
});

const walk: DestBail = {
  kind: "walk",
  walkMin: 8,
  waitMin: 14,
  destLabel: "Home",
  routeShort: "31",
};
const keep: DestBail = { kind: "keepWait", walkMin: 8, waitMin: 9, routeShort: "31" };

describe("waitFlipPhase", () => {
  it("maps live, multi-leg and hero names onto dest-bail's three states", () => {
    expect(waitFlipPhase("walking-to-stop")).toBe("walking");
    expect(waitFlipPhase("walking-to-board")).toBe("walking");
    expect(waitFlipPhase("at-stop")).toBe("waiting");
    expect(waitFlipPhase("waiting-to-board")).toBe("waiting");
    expect(waitFlipPhase("hurry-soft")).toBe("waiting");
    expect(waitFlipPhase("on-bus")).toBe("other");
    expect(waitFlipPhase("riding")).toBe("other");
  });
});

describe("nextWaitFlip", () => {
  it("stays silent until the previous kind has been held 60s", () => {
    expect(WAIT_FLIP_HOLD_SEC).toBe(60);
    expect(
      nextWaitFlip({
        prev: keep,
        next: walk,
        flipSpoken: false,
        prevSinceUnix: 1_000,
        nowUnix: 1_059,
      }),
    ).toBeNull();
  });

  it("fires keepWait → walk after the hold", () => {
    expect(
      nextWaitFlip({
        prev: keep,
        next: walk,
        flipSpoken: false,
        prevSinceUnix: 1_000,
        nowUnix: 1_060,
      }),
    ).toEqual({ from: keep, to: walk });
  });

  it("stays silent on a second flip, a same-kind tick, or a missing side", () => {
    expect(
      nextWaitFlip({
        prev: keep,
        next: walk,
        flipSpoken: true,
        prevSinceUnix: 1_000,
        nowUnix: 1_120,
      }),
    ).toBeNull();
    expect(
      nextWaitFlip({
        prev: keep,
        next: keep,
        flipSpoken: false,
        prevSinceUnix: 1_000,
        nowUnix: 1_120,
      }),
    ).toBeNull();
    expect(
      nextWaitFlip({
        prev: null,
        next: walk,
        flipSpoken: false,
        prevSinceUnix: 1_000,
        nowUnix: 1_120,
      }),
    ).toBeNull();
  });
});

describe("tickWaitFlip", () => {
  it("resets the session when the action goes silent, then can fire again", () => {
    const state = EMPTY_WAIT_FLIP_HOLD;
    const t0 = tickWaitFlip(state, keep, 1_000);
    expect(t0.flip).toBeNull();
    const t1 = tickWaitFlip(t0.hold, walk, 1_060);
    expect(t1.flip).toEqual({ from: keep, to: walk });
    expect(t1.hold.spoken).toBe(true);
    const t2 = tickWaitFlip(t1.hold, keep, 1_180);
    expect(t2.flip).toBeNull();
    const t3 = tickWaitFlip(t2.hold, null, 1_181);
    expect(t3.hold).toEqual(EMPTY_WAIT_FLIP_HOLD);
    const t4 = tickWaitFlip(t3.hold, keep, 1_200);
    const t5 = tickWaitFlip(t4.hold, walk, 1_260);
    expect(t5.flip).toEqual({ from: keep, to: walk });
  });

  it("does not treat a 1-frame kind blip as a flip", () => {
    const held = tickWaitFlip(EMPTY_WAIT_FLIP_HOLD, keep, 1_000);
    const blip = tickWaitFlip(held.hold, walk, 1_010);
    expect(blip.flip).toBeNull();
    const back = tickWaitFlip(blip.hold, keep, 1_011);
    expect(back.flip).toBeNull();
    expect(back.hold.spoken).toBe(false);
  });
});

describe("destBailFlipLine", () => {
  it("names Bus N and the walk, with no euro, luggage, or other-route", () => {
    const toWalk = destBailFlipLine({ from: keep, to: walk });
    expect(toWalk).toBe("Bus 31 is now 14 min if it shows. Walking is 8 min — walk.");
    const toWait = destBailFlipLine({ from: walk, to: keep });
    expect(toWait).toBe("Bus 31 is about 9 min if it shows. Walking is 8 min — wait.");
    const copy = destBailFlipCopy({ from: keep, to: walk });
    expect(copy.title).toBe("Walk to Home");
    expect(copy.body).toBe(toWalk);
    expect(destBailFlipCopy({ from: walk, to: keep }).title).toBe("Keep waiting for Bus 31");
    expect(`${toWalk} ${toWait}`).not.toMatch(/€|luggage|last.?coach|exact change|leaves in/i);
    expect(destBailEn["ml.destBail.flipWalk"]).toBe(
      "Bus {route} is now {wait} min if it shows. Walking is {walk} min — walk.",
    );
    expect(destBailEn["ml.destBail.flipWait"]).toBe(
      "Bus {route} is about {wait} min if it shows. Walking is {walk} min — wait.",
    );
  });
});

describe("destBailForFlipAlert", () => {
  it("rebuilds the new dest-bail from semantic alert fields", () => {
    expect(
      destBailForFlipAlert({
        flipTo: "walk",
        walkMin: 8,
        waitMin: 14,
        routeShort: "31",
        destLabel: "Home",
      }),
    ).toEqual(walk);
    expect(
      destBailForFlipAlert({ flipTo: "walk", walkMin: 8, waitMin: 14, routeShort: "31" }),
    ).toBeNull();
    expect(
      destBailForFlipAlert({ flipTo: "keepWait", walkMin: 8, waitMin: 9, routeShort: "31" }),
    ).toEqual(keep);
  });
});
