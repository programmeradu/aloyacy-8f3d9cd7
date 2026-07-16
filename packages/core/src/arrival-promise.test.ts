import { describe, expect, it } from "vitest";
import {
  buildDepartureLadder,
  composeLeaveBuffer,
  countdownLabel,
  isReplanDue,
  isUnmakeable,
  leaveByUnixFor,
  nextNudge,
  nudgeCopy,
  promiseHeadline,
  promiseStatusFor,
  replanIntervalSec,
  rungLine,
  rushHourFactor,
  type ItineraryLike,
  type PromiseSnapshot,
} from "./arrival-promise";

const T = 1_800_000_000; // fixed reference "now"

function itin(part: Partial<ItineraryLike> & { id: string }): ItineraryLike {
  return {
    departureUnix: T,
    arrivalUnix: T + 3600,
    totalDurationSec: 3600,
    transfers: 0,
    legs: [
      { kind: "walk", durationSec: 300 },
      { kind: "ride", routeShort: "30", durationSec: 3300 },
    ],
    ...part,
  };
}

describe("leaveByUnixFor", () => {
  it("subtracts every pre-ride leg from the first ride departure", () => {
    const it = itin({
      id: "a",
      departureUnix: T,
      legs: [
        { kind: "walk", durationSec: 300 },
        { kind: "wait", durationSec: 120 },
        { kind: "ride", routeShort: "30", durationSec: 1800 },
      ],
    });
    expect(leaveByUnixFor(it)).toBe(T - 420);
  });

  it("leaves immediately for a walk-only itinerary", () => {
    const it = itin({ id: "w", legs: [{ kind: "walk", durationSec: 900 }] });
    expect(leaveByUnixFor(it)).toBe(T);
  });
});

describe("buildDepartureLadder", () => {
  const target = T + 4 * 3600; // arrive by T+4h

  it("recommends the latest option that still clears the margin", () => {
    const ladder = buildDepartureLadder(
      [
        itin({ id: "early", departureUnix: T, arrivalUnix: T + 3600 }),
        itin({ id: "mid", departureUnix: T + 3600, arrivalUnix: T + 3 * 3600 }),
        itin({ id: "latest-ok", departureUnix: T + 2 * 3600, arrivalUnix: target - 15 * 60 }),
        itin({ id: "too-late", departureUnix: T + 3 * 3600, arrivalUnix: target + 10 * 60 }),
      ],
      target,
    );
    expect(ladder.find((r) => r.recommended)?.itineraryId).toBe("latest-ok");
    expect(ladder.map((r) => r.verdict)).toContain("late");
  });

  it("treats an option inside the margin as tight, not comfortable", () => {
    const ladder = buildDepartureLadder(
      [itin({ id: "tight", arrivalUnix: target - 3 * 60 })],
      target,
      "normal",
    );
    expect(ladder[0].verdict).toBe("tight");
  });

  it("honours a tight margin preference", () => {
    const ladder = buildDepartureLadder(
      [itin({ id: "tight", arrivalUnix: target - 3 * 60 })],
      target,
      "tight",
    );
    expect(ladder[0].verdict).toBe("comfortable");
  });

  it("still recommends the least-late option when nothing makes it", () => {
    const ladder = buildDepartureLadder(
      [
        itin({ id: "late-a", arrivalUnix: target + 30 * 60 }),
        itin({ id: "late-b", departureUnix: T + 600, arrivalUnix: target + 5 * 60 }),
      ],
      target,
    );
    expect(ladder.find((r) => r.recommended)?.itineraryId).toBe("late-b");
    expect(isUnmakeable(ladder)).toBe(true);
  });

  it("collapses duplicate departures and caps the rung count", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      itin({
        id: `i${i}`,
        departureUnix: T + i * 600,
        arrivalUnix: T + i * 600 + 3600,
      }),
    );
    const dup = itin({ id: "dup", departureUnix: T, arrivalUnix: T + 3600 });
    const ladder = buildDepartureLadder([...many, dup], target, "normal", 4);
    expect(ladder).toHaveLength(4);
    expect(ladder.map((r) => r.leaveByUnix)).toEqual(
      [...ladder.map((r) => r.leaveByUnix)].sort((a, b) => a - b),
    );
  });

  it("returns nothing for no itineraries", () => {
    expect(buildDepartureLadder([], target)).toEqual([]);
    expect(isUnmakeable([])).toBe(false);
  });
});

describe("rushHourFactor", () => {
  it("applies the island default curve on a weekday morning", () => {
    expect(rushHourFactor({ hourOfDay: 8, dayOfWeek: 2 })).toBe(240);
  });

  it("covers the 13:00 school run", () => {
    expect(rushHourFactor({ hourOfDay: 13, dayOfWeek: 3 })).toBeGreaterThan(120);
  });

  it("is quiet on Sundays and public holidays", () => {
    expect(rushHourFactor({ hourOfDay: 8, dayOfWeek: 0 })).toBe(0);
    expect(rushHourFactor({ hourOfDay: 8, dayOfWeek: 2, isHoliday: true })).toBe(0);
  });

  it("mutes the curve on Saturdays", () => {
    expect(rushHourFactor({ hourOfDay: 8, dayOfWeek: 6 })).toBe(72);
  });

  it("prefers a learned profile with enough samples", () => {
    const sec = rushHourFactor({
      hourOfDay: 8,
      dayOfWeek: 2,
      profile: [{ hourOfDay: 8, dayOfWeek: 2, meanDelaySec: 420, sampleCount: 30 }],
    });
    expect(sec).toBe(300);
  });

  it("ignores a thin learned profile", () => {
    const sec = rushHourFactor({
      hourOfDay: 8,
      dayOfWeek: 2,
      profile: [{ hourOfDay: 8, dayOfWeek: 2, meanDelaySec: 999, sampleCount: 2 }],
    });
    expect(sec).toBe(240);
  });

  it("never exceeds the rush cap", () => {
    const sec = rushHourFactor({
      hourOfDay: 8,
      dayOfWeek: 2,
      profile: [{ hourOfDay: 8, dayOfWeek: 2, meanDelaySec: 5000, sampleCount: 50 }],
    });
    expect(sec).toBe(360);
  });
});

describe("composeLeaveBuffer", () => {
  it("returns nothing when every signal is quiet", () => {
    const r = composeLeaveBuffer({});
    expect(r.extraSec).toBe(0);
    expect(r.reasonShort).toBeNull();
  });

  it("ignores sub-minute noise", () => {
    const r = composeLeaveBuffer({ weatherSec: 30, trafficSec: 20 });
    expect(r.reasons).toHaveLength(0);
    expect(r.extraSec).toBe(50);
  });

  it("names every contributing factor in one line", () => {
    const r = composeLeaveBuffer({
      weatherSec: 120,
      weatherLabel: "heavy rain",
      trafficSec: 180,
      rushSec: 120,
    });
    expect(r.extraSec).toBe(420);
    expect(r.reasonShort).toBe("heavy rain + buses running late + rush hour — leave 7 min earlier");
  });

  it("caps each component and the total", () => {
    const r = composeLeaveBuffer({
      weatherSec: 9999,
      trafficSec: 9999,
      rushSec: 9999,
      disruptionSec: 9999,
    });
    expect(r.extraSec).toBe(20 * 60);
  });

  it("labels disruptions with the incident text when given", () => {
    const r = composeLeaveBuffer({ disruptionSec: 300, disruptionLabel: "A1 closure" });
    expect(r.reasonShort).toContain("A1 closure");
  });
});

describe("nextNudge", () => {
  const base: PromiseSnapshot = {
    leaveByUnix: T + 3600,
    baselineLeaveByUnix: T + 3600,
    targetArrivalUnix: T + 4 * 3600,
    status: "watching",
    nudgesSent: [],
  };

  it("fires the hour warning first", () => {
    expect(nextNudge(base, T)).toBe("t60");
  });

  it("never repeats a sent nudge", () => {
    expect(nextNudge({ ...base, nudgesSent: ["t60"] }, T)).toBeNull();
  });

  it("skips overtaken steps when the promise is created late", () => {
    const late = { ...base, leaveByUnix: T + 12 * 60 };
    expect(nextNudge(late, T)).toBe("t15");
  });

  it("escalates to leave-now at the departure moment", () => {
    expect(nextNudge({ ...base, leaveByUnix: T, nudgesSent: ["t60", "t30", "t15"] }, T)).toBe("now");
  });

  it("does not fire a stale leave-now long after the fact", () => {
    expect(nextNudge({ ...base, leaveByUnix: T - 40 * 60 }, T)).toBeNull();
  });

  it("reports an unmakeable promise before anything else", () => {
    expect(nextNudge({ ...base, unmakeable: true }, T)).toBe("unmakeable");
  });

  it("alerts on meaningful drift once the countdown steps are done", () => {
    const drifted: PromiseSnapshot = {
      ...base,
      leaveByUnix: T + 90 * 60,
      baselineLeaveByUnix: T + 100 * 60,
      nudgesSent: [],
    };
    expect(nextNudge(drifted, T)).toBe("changed");
  });

  it("ignores drift under the threshold", () => {
    const drifted: PromiseSnapshot = {
      ...base,
      leaveByUnix: T + 98 * 60,
      baselineLeaveByUnix: T + 100 * 60,
    };
    expect(nextNudge(drifted, T)).toBeNull();
  });

  it("goes silent once cancelled", () => {
    expect(nextNudge({ ...base, status: "cancelled" }, T)).toBeNull();
  });
});

describe("promiseStatusFor", () => {
  it("flips to leave-now at the leave time", () => {
    expect(
      promiseStatusFor(
        { leaveByUnix: T, targetArrivalUnix: T + 3600, status: "watching" },
        T + 10,
      ),
    ).toBe("leave-now");
  });

  it("marks a missed promise when nothing makes the target", () => {
    expect(
      promiseStatusFor(
        { leaveByUnix: T + 600, targetArrivalUnix: T + 3600, status: "watching", unmakeable: true },
        T,
      ),
    ).toBe("missed");
  });

  it("closes out after the target time passes", () => {
    expect(
      promiseStatusFor({ leaveByUnix: T, targetArrivalUnix: T + 60, status: "watching" }, T + 120),
    ).toBe("done");
  });

  it("never resurrects a cancelled promise", () => {
    expect(
      promiseStatusFor({ leaveByUnix: T, targetArrivalUnix: T + 3600, status: "cancelled" }, T),
    ).toBe("cancelled");
  });
});

describe("watch cadence", () => {
  it("re-plans every tick inside the last hour", () => {
    expect(replanIntervalSec(30 * 60)).toBe(0);
  });

  it("slows down for far-off promises", () => {
    expect(replanIntervalSec(3 * 3600)).toBe(15 * 60);
    expect(replanIntervalSec(20 * 3600)).toBe(60 * 60);
  });

  it("always plans a promise that has never been planned", () => {
    expect(isReplanDue({ nowUnix: T, leaveByUnix: T + 20 * 3600, lastReplanUnix: null })).toBe(true);
  });

  it("waits out the interval", () => {
    expect(
      isReplanDue({ nowUnix: T, leaveByUnix: T + 3 * 3600, lastReplanUnix: T - 5 * 60 }),
    ).toBe(false);
    expect(
      isReplanDue({ nowUnix: T, leaveByUnix: T + 3 * 3600, lastReplanUnix: T - 16 * 60 }),
    ).toBe(true);
  });
});

describe("copy", () => {
  const rung = {
    itineraryId: "a",
    leaveByUnix: T,
    arrivalUnix: T + 3600,
    slackSec: 12 * 60,
    verdict: "comfortable" as const,
    transfers: 0,
    routes: ["30"],
    recommended: true,
  };

  it("writes a ladder line with both clock times and the slack", () => {
    expect(rungLine(rung)).toMatch(/^Leave \d{2}:\d{2} → arrive \d{2}:\d{2} · 12 min to spare$/);
  });

  it("says how late a losing option is", () => {
    expect(rungLine({ ...rung, slackSec: -4 * 60 })).toContain("4 min too late");
  });

  it("headlines the promise with a human day label", () => {
    const line = promiseHeadline({
      destinationLabel: "Larnaca",
      targetArrivalUnix: T + 86_400,
      nowUnix: T,
    });
    expect(line).toContain("Larnaca by");
    expect(line).toContain("tomorrow");
  });

  it("counts down in plain language", () => {
    expect(countdownLabel(T + 42 * 60, T)).toBe("leave in 42 min");
    expect(countdownLabel(T, T)).toBe("leave now");
    expect(countdownLabel(T + 125 * 60, T)).toBe("leave in 2 h 5 min");
    expect(countdownLabel(T + 120 * 60, T)).toBe("leave in 2 h");
    expect(countdownLabel(T - 300, T)).toBe("leave time passed 5 min ago");
  });

  it("names the route in the leave-now push", () => {
    const copy = nudgeCopy({
      kind: "now",
      destinationLabel: "Larnaca",
      targetArrivalUnix: T + 3600,
      leaveByUnix: T,
      routes: ["410"],
      reasonShort: "rush hour — leave 4 min earlier",
    });
    expect(copy.title).toContain("BUS 410");
    expect(copy.body).toContain("rush hour");
  });

  it("is honest when the target is out of reach", () => {
    const copy = nudgeCopy({
      kind: "unmakeable",
      destinationLabel: "Larnaca",
      targetArrivalUnix: T + 3600,
      leaveByUnix: T,
      routes: [],
      earliestArrivalUnix: T + 5400,
    });
    expect(copy.body).toContain("earliest bus arrival");
  });
});
