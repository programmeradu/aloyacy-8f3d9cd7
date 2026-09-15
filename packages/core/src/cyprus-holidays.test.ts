import { describe, it, expect } from "vitest";
import {
  getOrthodoxEasterSunday,
  getCyprusHolidaysForYear,
  isCyprusPublicHoliday,
  getCyprusHolidayInfo,
  effectiveTransitWeekday,
} from "./cyprus-holidays";

describe("Cyprus Public Holidays and Transit Service Resolution", () => {
  it("computes accurate Orthodox Easter Sunday for multiple years", () => {
    // 2025: April 20
    expect(getOrthodoxEasterSunday(2025)).toEqual({ month: 4, day: 20 });
    // 2026: April 12
    expect(getOrthodoxEasterSunday(2026)).toEqual({ month: 4, day: 12 });
    // 2027: May 2
    expect(getOrthodoxEasterSunday(2027)).toEqual({ month: 5, day: 2 });
    // 2028: April 16
    expect(getOrthodoxEasterSunday(2028)).toEqual({ month: 4, day: 16 });
  });

  it("lists all 15 official Cyprus public holidays for 2026", () => {
    const list2026 = getCyprusHolidaysForYear(2026);
    expect(list2026.length).toBe(15);

    // Fixed holidays
    expect(list2026.find((h) => h.nameEn === "New Year's Day")?.dateCompact).toBe("20260101");
    expect(list2026.find((h) => h.nameEn === "Epiphany")?.dateCompact).toBe("20260106");
    expect(list2026.find((h) => h.nameEn === "Greek Independence Day")?.dateCompact).toBe("20260325");
    expect(list2026.find((h) => h.nameEn === "Cyprus National Day")?.dateCompact).toBe("20260401");
    expect(list2026.find((h) => h.nameEn === "Labour Day")?.dateCompact).toBe("20260501");
    expect(list2026.find((h) => h.nameEn === "Assumption of the Virgin Mary")?.dateCompact).toBe("20260815");
    expect(list2026.find((h) => h.nameEn === "Cyprus Independence Day")?.dateCompact).toBe("20261001");
    expect(list2026.find((h) => h.nameEn === "Ohi Day")?.dateCompact).toBe("20261028");
    expect(list2026.find((h) => h.nameEn === "Christmas Day")?.dateCompact).toBe("20261225");
    expect(list2026.find((h) => h.nameEn === "Boxing Day")?.dateCompact).toBe("20261226");

    // Movable 2026 holidays based on Easter April 12, 2026
    expect(list2026.find((h) => h.nameEn === "Green Monday")?.dateCompact).toBe("20260223");
    expect(list2026.find((h) => h.nameEn === "Good Friday")?.dateCompact).toBe("20260410");
    expect(list2026.find((h) => h.nameEn === "Easter Monday")?.dateCompact).toBe("20260413");
    expect(list2026.find((h) => h.nameEn === "Easter Tuesday")?.dateCompact).toBe("20260414");
    expect(list2026.find((h) => h.nameEn === "Pentecost (Kataklysmos)")?.dateCompact).toBe("20260601");
  });

  it("correctly identifies holidays by compact (YYYYMMDD) and dashed (YYYY-MM-DD) formats", () => {
    // Cyprus Independence Day: October 1
    expect(isCyprusPublicHoliday("20261001")).toBe(true);
    expect(isCyprusPublicHoliday("2026-10-01")).toBe(true);

    // Regular day (e.g. Sep 15, 2026)
    expect(isCyprusPublicHoliday("20260915")).toBe(false);
    expect(isCyprusPublicHoliday("2026-09-15")).toBe(false);

    // Green Monday 2026 (Feb 23)
    const greenMonday = getCyprusHolidayInfo("20260223");
    expect(greenMonday).not.toBeNull();
    expect(greenMonday?.nameEn).toBe("Green Monday");
    expect(greenMonday?.nameEl).toBe("Καθαρά Δευτέρα");
    expect(greenMonday?.runsSundaySchedule).toBe(true);
  });

  it("maps statutory holidays on weekdays to Sunday (0) transit schedules", () => {
    // 2026-10-01 (Cyprus Independence Day) is a Thursday (calendar weekday = 4)
    const indepDay = effectiveTransitWeekday("20261001");
    expect(indepDay.isHoliday).toBe(true);
    expect(indepDay.holidayNameEn).toBe("Cyprus Independence Day");
    expect(indepDay.weekday).toBe(0); // Mapped to Sunday schedule!

    // 2026-09-15 (Tuesday, regular day)
    const normalDay = effectiveTransitWeekday("20260915");
    expect(normalDay.isHoliday).toBe(false);
    expect(normalDay.weekday).toBe(2); // Tuesday

    // 2026-09-20 (Sunday)
    const sunday = effectiveTransitWeekday("20260920");
    expect(sunday.isHoliday).toBe(false);
    expect(sunday.weekday).toBe(0); // Sunday
  });
});
