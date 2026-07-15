import { describe, expect, it } from "vitest";
import { resolveServiceDates, weekdayOf } from "./schedule-calendar";

describe("weekdayOf", () => {
  it("reads the weekday from a YYYYMMDD service date", () => {
    expect(weekdayOf("20260822")).toBe(6); // Saturday
    expect(weekdayOf("20260823")).toBe(0); // Sunday
    expect(weekdayOf("20260824")).toBe(1); // Monday
  });
});

describe("resolveServiceDates", () => {
  const longFeed = {
    "2:weekday": { feedId: 2, dates: ["20260820", "20260821", "20260824"] },
    "2:sat": { feedId: 2, dates: ["20260822"] },
  };
  // Feed 6 publishes only a week and stopped on 20260816 (a Saturday).
  const shortFeed = {
    "6:weekday": { feedId: 6, dates: ["20260813", "20260814"] },
    "6:sat": { feedId: 6, dates: ["20260815", "20260816"] },
    "6:sun": { feedId: 6, dates: ["20260809"] },
  };

  it("uses published services when the date is covered", () => {
    const r = resolveServiceDates(longFeed, ["20260822"]).get("20260822")!;
    expect([...r.active]).toEqual(["2:sat"]);
    expect(r.projectedFeeds).toEqual([]);
  });

  it("projects a stale feed forward using the same weekday", () => {
    // 20260816 is a Sunday, 20260815 a Saturday in this fixture's shape.
    const r = resolveServiceDates(shortFeed, ["20260822"]).get("20260822")!;
    expect(r.projectedFeeds).toEqual([6]);
    // 20260822 is a Saturday; newest published Saturday is 20260815.
    expect(r.projectedFrom[6]).toBe("20260815");
    expect([...r.active]).toEqual(["6:sat"]);
  });

  it("keeps both feeds alive in one shard", () => {
    const r = resolveServiceDates({ ...longFeed, ...shortFeed }, ["20260822"]).get("20260822")!;
    expect([...r.active].sort()).toEqual(["2:sat", "6:sat"]);
    expect(r.projectedFeeds).toEqual([6]);
  });

  it("never back-fills a gap inside a published range", () => {
    const withGap = { "9:a": { feedId: 9, dates: ["20260820", "20260824"] } };
    const r = resolveServiceDates(withGap, ["20260822"]).get("20260822")!;
    expect(r.active.size).toBe(0);
    expect(r.projectedFeeds).toEqual([]);
  });

  it("returns an entry for every requested date", () => {
    const dates = ["20260822", "20260823", "20260824"];
    const map = resolveServiceDates(shortFeed, dates);
    expect([...map.keys()]).toEqual(dates);
    // Sunday projection comes from the only published Sunday.
    expect(map.get("20260823")!.projectedFrom[6]).toBe("20260809");
  });

  it("skips a feed with no matching weekday published", () => {
    const onlyMonday = { "5:a": { feedId: 5, dates: ["20260817"] } };
    const r = resolveServiceDates(onlyMonday, ["20260822"]).get("20260822")!;
    expect(r.active.size).toBe(0);
  });
});
