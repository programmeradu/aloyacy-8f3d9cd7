import { describe, expect, it } from "vitest";
import {
  countDaysOfKind,
  isLastTonight,
  lastTonightOnRoute,
  LAST_BUS_HOUR,
  noShowSlotKey,
  pickNoShow,
  shouldSpeakNoShow,
  tallyNoShows,
} from "./no-show";

describe("shouldSpeakNoShow", () => {
  it("stays quiet below three misses", () => {
    expect(shouldSpeakNoShow(2, 20, false)).toBe(false);
  });

  it("speaks at 6 of 20 weekdays", () => {
    expect(shouldSpeakNoShow(6, 20, false)).toBe(true);
  });

  it("needs more weekday history than weekend history", () => {
    expect(shouldSpeakNoShow(3, 8, false)).toBe(false);
    expect(shouldSpeakNoShow(3, 8, true)).toBe(true);
  });
});

describe("tallyNoShows", () => {
  it("buckets by route, hour and weekend, using stamped hour when present", () => {
    const map = tallyNoShows([
      {
        route_id: "30",
        detected_at: "2026-08-20T16:00:00.000Z",
        hour_of_day: 18,
        day_of_week: 4,
      },
      {
        route_id: "30",
        detected_at: "2026-08-21T16:10:00.000Z",
        hour_of_day: 18,
        day_of_week: 5,
      },
      {
        route_id: "30",
        detected_at: "2026-08-22T16:10:00.000Z",
        hour_of_day: 18,
        day_of_week: 6,
      },
    ]);
    expect(map.get(noShowSlotKey("30", 18, false))?.missed).toBe(2);
    expect(map.get(noShowSlotKey("30", 18, true))?.missed).toBe(1);
  });
});

describe("isLastTonight", () => {
  it("is silent before 21:00 even if nothing later is in the snapshot", () => {
    expect(isLastTonight(20, 0)).toBe(false);
  });

  it("names last-bus at 21:00 with no later trip", () => {
    expect(isLastTonight(LAST_BUS_HOUR, 0)).toBe(true);
    expect(isLastTonight(22, 1)).toBe(false);
  });
});

describe("pickNoShow", () => {
  it("returns the matching slot only when the threshold is met", () => {
    const now = Date.UTC(2026, 7, 27, 12);
    const slots = [{ routeId: "30", hour: 18, weekend: false, missed: 6 }];
    // 18:40 Cyprus summer = 15:40Z
    const hit = pickNoShow(slots, "30", Date.UTC(2026, 7, 27, 15, 40) / 1000, now);
    expect(hit).toEqual({ missed: 6, days: countDaysOfKind(now, 30, false), weekend: false });
    expect(pickNoShow(slots, "30", Date.UTC(2026, 7, 27, 10, 0) / 1000, now)).toBeNull();
  });
});

describe("lastTonightOnRoute", () => {
  it("is true only for the last 21:00+ trip at this stop", () => {
    const stopId = "s1";
    const arrivals = [
      { stopId, routeId: "30", arrivalUnix: Date.UTC(2026, 7, 27, 18, 10) / 1000 }, // 21:10 CY
      { stopId, routeId: "30", arrivalUnix: Date.UTC(2026, 7, 27, 18, 40) / 1000 }, // 21:40 CY
    ];
    expect(lastTonightOnRoute(arrivals, stopId, "30", arrivals[0]!.arrivalUnix)).toBe(false);
    expect(lastTonightOnRoute(arrivals, stopId, "30", arrivals[1]!.arrivalUnix)).toBe(true);
  });
});

describe("countDaysOfKind", () => {
  it("counts 20–22 weekdays in a 30-day lookback", () => {
    // Thursday 2026-08-27 12:00Z = 15:00 Cyprus.
    const now = Date.UTC(2026, 7, 27, 12);
    const weekdays = countDaysOfKind(now, 30, false);
    const weekend = countDaysOfKind(now, 30, true);
    expect(weekdays + weekend).toBe(30);
    expect(weekdays).toBeGreaterThanOrEqual(20);
    expect(weekdays).toBeLessThanOrEqual(22);
  });
});
