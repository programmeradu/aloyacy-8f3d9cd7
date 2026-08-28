import { describe, expect, it } from "vitest";
import {
  cyAddDays,
  cyClock,
  cyDayDiff,
  cyHourDow,
  cyInputToMs,
  cyInputValue,
  cyIsWeekend,
  cyParts,
  cyStartOfDayMs,
  cyWallToMs,
  cyYmd,
} from "./cy-time";


describe("cy-time", () => {
  it("parses a Cyprus summer wall clock at UTC+3", () => {
    // 2026-08-23 08:30 Cyprus (EEST) === 05:30Z
    expect(cyWallToMs(2026, 8, 23, 8, 30)).toBe(Date.UTC(2026, 7, 23, 5, 30));
  });

  it("parses a Cyprus winter wall clock at UTC+2", () => {
    expect(cyWallToMs(2026, 1, 15, 8, 30)).toBe(Date.UTC(2026, 0, 15, 6, 30));
  });

  it("round-trips a datetime-local value regardless of device zone", () => {
    const ms = cyInputToMs("2026-08-23T08:30");
    expect(ms).not.toBeNull();
    expect(cyInputValue(ms!)).toBe("2026-08-23T08:30");
    expect(cyClock(ms!)).toBe("08:30");
    expect(cyYmd(ms!)).toBe("2026-08-23");

  });

  it("rejects malformed input instead of guessing", () => {
    expect(cyInputToMs("")).toBeNull();
    expect(cyInputToMs("tomorrow morning")).toBeNull();
  });

  it("reports Cyprus parts, not device parts", () => {
    const p = cyParts(Date.UTC(2026, 7, 23, 22, 45)); // 01:45 next day in CY
    expect(p.day).toBe(24);
    expect(p.hour).toBe(1);
    expect(p.weekday).toBe(1); // Monday
  });

  it("anchors midnight and counts calendar days in Cyprus", () => {
    const start = cyStartOfDayMs(cyWallToMs(2026, 8, 23, 23, 30));
    expect(cyClock(start)).toBe("00:00");
    expect(cyDayDiff(cyWallToMs(2026, 8, 23, 23, 30), cyWallToMs(2026, 8, 24, 0, 30))).toBe(1);
  });

  it("knows Cyprus weekends", () => {
    expect(cyIsWeekend(cyWallToMs(2026, 8, 22, 12, 0))).toBe(true); // Saturday
    expect(cyIsWeekend(cyWallToMs(2026, 8, 24, 12, 0))).toBe(false); // Monday
  });

  it("keeps the wall clock when adding days across the DST switch", () => {
    // Cyprus falls back on the last Sunday of October 2026 (25th).
    const before = cyWallToMs(2026, 10, 24, 9, 0);
    expect(cyClock(cyAddDays(before, 2))).toBe("09:00");
  });

  it("buckets hour/dow in Asia/Nicosia, never UTC", () => {
    // 22:45Z on 23 Aug 2026 is 01:45 Monday in Cyprus.
    const { hour, dow } = cyHourDow(Date.UTC(2026, 7, 23, 22, 45));
    expect(hour).toBe(1);
    expect(dow).toBe(1);
    // Afternoon Cyprus must not land in a UTC morning cell.
    const afternoon = cyHourDow(cyWallToMs(2026, 8, 23, 16, 0));
    expect(afternoon.hour).toBe(16);
    expect(afternoon.dow).toBe(0); // Sunday
  });
});
