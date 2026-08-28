import { describe, expect, it } from "vitest";
import {
  chancePercent,
  lastSeenAgeSec,
  medianGapSec,
  pickHeadwayForDepartures,
  pickHeadwayHint,
  pickHeadwayMean,
  scheduledGapAtStop,
  survivalChance,
  type HeadwayObs,
} from "./headway-chance";

const STOP = "s1";
const ROUTE = "30";
// Thursday 18:00 Cyprus summer (UTC+3) — weekday evening.
const NOW_MS = Date.UTC(2026, 7, 27, 15, 0);
const NOW = NOW_MS / 1000;

const obs = (over: Partial<HeadwayObs> = {}): HeadwayObs => ({
  routeId: ROUTE,
  stopId: STOP,
  hour: 18,
  dow: 4,
  observedSec: 12 * 60,
  scheduledSec: 0,
  samples: 8,
  ...over,
});

describe("medianGapSec", () => {
  it("returns the median of plausible gaps", () => {
    expect(medianGapSec([100, 820, 1540])).toBe(720);
  });

  it("needs two times", () => {
    expect(medianGapSec([100])).toBeNull();
  });
});

describe("scheduledGapAtStop", () => {
  it("ignores other stops and routes", () => {
    const gap = scheduledGapAtStop(
      [
        { stopId: STOP, routeId: ROUTE, arrivalUnix: NOW + 600 },
        { stopId: STOP, routeId: ROUTE, arrivalUnix: NOW + 1320 },
        { stopId: STOP, routeId: "25", arrivalUnix: NOW + 660 },
        { stopId: "s2", routeId: ROUTE, arrivalUnix: NOW + 900 },
      ],
      STOP,
      ROUTE,
    );
    expect(gap).toBe(720);
  });
});

describe("lastSeenAgeSec", () => {
  it("returns age when a ping sits in the speakable window", () => {
    expect(lastSeenAgeSec([{ routeId: ROUTE, timestamp: NOW - 19 * 60 }], ROUTE, NOW)).toBe(
      19 * 60,
    );
  });

  it("stays quiet under 90 s and past 90 min", () => {
    expect(lastSeenAgeSec([{ routeId: ROUTE, timestamp: NOW - 30 }], ROUTE, NOW)).toBeNull();
    expect(lastSeenAgeSec([{ routeId: ROUTE, timestamp: NOW - 91 * 60 }], ROUTE, NOW)).toBeNull();
  });
});

describe("survivalChance", () => {
  it("is ~63% at one headway with no last-seen", () => {
    expect(survivalChance(720, 720, null)).toBeCloseTo(1 - Math.exp(-1), 5);
  });

  it("rises when the last bus was recent", () => {
    const base = survivalChance(600, 720, null);
    const due = survivalChance(600, 720, 600);
    expect(due).toBeGreaterThan(base);
  });

  it("falls when the last bus is overdue", () => {
    const onTime = survivalChance(600, 720, 700);
    const late = survivalChance(600, 720, 19 * 60);
    expect(late).toBeLessThan(onTime);
  });
});

describe("chancePercent", () => {
  it("rounds to five and stays inside 15–90", () => {
    expect(chancePercent(0.632)).toBe(65);
    expect(chancePercent(0.99)).toBe(90);
    expect(chancePercent(0.08)).toBeNull();
  });
});

describe("pickHeadwayMean", () => {
  it("prefers observed once there are five samples", () => {
    expect(pickHeadwayMean(obs(), 20 * 60)).toEqual({
      meanSec: 12 * 60,
      source: "observed",
    });
  });

  it("falls back to the timetable gap when samples are thin", () => {
    expect(pickHeadwayMean(obs({ samples: 2, observedSec: 600 }), 15 * 60)).toEqual({
      meanSec: 15 * 60,
      source: "scheduled",
    });
  });

  it("stays quiet when nothing is in range", () => {
    expect(pickHeadwayMean(obs({ samples: 1, observedSec: 30, scheduledSec: 0 }), 30)).toBeNull();
  });
});

describe("pickHeadwayHint", () => {
  it("names weekday evenings and quotes a clock", () => {
    const hint = pickHeadwayHint({
      obs: obs(),
      scheduledGapSec: null,
      lastSeenAgeSec: 19 * 60,
      arrivalUnix: NOW + 15 * 60,
      nowSec: NOW,
    });
    expect(hint).not.toBeNull();
    expect(hint!.when).toBe("weekdayEvening");
    expect(hint!.source).toBe("observed");
    expect(hint!.meanMin).toBe(12);
    expect(hint!.lastSeenMin).toBe(19);
    expect(hint!.chancePct).toBeGreaterThanOrEqual(15);
    expect(hint!.beforeUnix).toBe(NOW + 15 * 60);
  });
});

describe("pickHeadwayForDepartures", () => {
  const arrivals = [
    { stopId: STOP, routeId: ROUTE, arrivalUnix: NOW + 600 },
    { stopId: STOP, routeId: ROUTE, arrivalUnix: NOW + 1320 },
  ];

  it("speaks once per route, only on ghost/scheduled", () => {
    const map = pickHeadwayForDepartures(
      [
        { tripId: "live", routeId: ROUTE, arrivalUnix: NOW + 300, tier: "live" },
        { tripId: "g1", routeId: ROUTE, arrivalUnix: NOW + 600, tier: "ghost" },
        { tripId: "g2", routeId: ROUTE, arrivalUnix: NOW + 1320, tier: "scheduled" },
        { tripId: "other", routeId: "25", arrivalUnix: NOW + 480, tier: "scheduled" },
      ],
      [obs(), obs({ routeId: "25", observedSec: 10 * 60 })],
      [],
      [
        ...arrivals,
        { stopId: STOP, routeId: "25", arrivalUnix: NOW + 480 },
        { stopId: STOP, routeId: "25", arrivalUnix: NOW + 1080 },
      ],
      STOP,
      NOW,
    );
    expect(map.has("live")).toBe(false);
    expect(map.has("g1")).toBe(true);
    expect(map.has("g2")).toBe(false);
    expect(map.has("other")).toBe(true);
  });
});
