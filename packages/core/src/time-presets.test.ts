import { describe, expect, it } from "vitest";
import { buildTimePresets, type TimeUsage } from "./time-presets";

/** Local-time helper so assertions read in wall clock, like the UI does. */
function at(y: number, mo: number, d: number, h: number, mi = 0) {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

describe("buildTimePresets", () => {
  const now = at(2026, 8, 24, 9, 5); // Monday 09:05

  it("never suggests a time in the past", () => {
    for (const mode of ["arrive", "leave"] as const) {
      for (const p of buildTimePresets({ nowMs: now, mode })) {
        expect(new Date(p.iso).getTime()).toBeGreaterThan(now);
      }
    }
  });

  it("returns at most three chips and keeps them in chronological order", () => {
    const p = buildTimePresets({ nowMs: now, mode: "arrive" });
    expect(p.length).toBeLessThanOrEqual(3);
    const times = p.map((x) => new Date(x.iso).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("rolls past anchors to the next day instead of dropping them", () => {
    const late = at(2026, 8, 24, 22, 40); // after every anchor
    const p = buildTimePresets({ nowMs: late, mode: "arrive" });
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x.dayKey === "tomorrow" || x.dayKey === "today")).toBe(true);
  });

  it("labels wall clock and relative day", () => {
    const p = buildTimePresets({ nowMs: at(2026, 8, 24, 6, 0), mode: "arrive" });
    const anchor = p.find((x) => x.timeLabel === "08:30");
    expect(anchor?.dayKey).toBe("today");
  });

  it("surfaces a repeated personal time ahead of generic anchors", () => {
    const history: TimeUsage[] = [
      { atMs: at(2026, 8, 17, 18, 45), mode: "arrive" },
      { atMs: at(2026, 8, 18, 18, 40), mode: "arrive" },
      { atMs: at(2026, 8, 19, 18, 50), mode: "arrive" },
      { atMs: at(2026, 8, 20, 7, 15), mode: "leave" },
    ];
    const p = buildTimePresets({ nowMs: now, mode: "arrive", history });
    const habit = p.find((x) => x.source === "habit");
    expect(habit?.timeLabel).toBe("18:45");
  });

  it("does not leak habits across modes", () => {
    const history: TimeUsage[] = [
      { atMs: at(2026, 8, 17, 6, 30), mode: "leave" },
      { atMs: at(2026, 8, 18, 6, 30), mode: "leave" },
    ];
    const p = buildTimePresets({ nowMs: now, mode: "arrive", history });
    expect(p.some((x) => x.source === "habit")).toBe(false);
  });

  it("keeps weekday habits off weekend days", () => {
    const friday = at(2026, 8, 21, 20, 0);
    const history: TimeUsage[] = [
      { atMs: at(2026, 8, 17, 7, 30), mode: "leave" },
      { atMs: at(2026, 8, 18, 7, 30), mode: "leave" },
      { atMs: at(2026, 8, 19, 7, 30), mode: "leave" },
    ];
    const p = buildTimePresets({ nowMs: friday, mode: "leave", history });
    const habit = p.find((x) => x.source === "habit");
    expect(habit).toBeDefined();
    const day = new Date(habit!.iso).getDay();
    expect(day === 0 || day === 6).toBe(false);
  });

  it("ignores stale history older than the habit window", () => {
    const history: TimeUsage[] = [
      { atMs: at(2025, 1, 6, 18, 45), mode: "arrive" },
      { atMs: at(2025, 1, 7, 18, 45), mode: "arrive" },
    ];
    const p = buildTimePresets({ nowMs: now, mode: "arrive", history });
    expect(p.some((x) => x.source === "habit")).toBe(false);
  });

  it("never returns two chips within the dedupe window", () => {
    const history: TimeUsage[] = [
      { atMs: at(2026, 8, 17, 13, 0), mode: "arrive" },
      { atMs: at(2026, 8, 18, 13, 5), mode: "arrive" },
    ];
    const p = buildTimePresets({ nowMs: now, mode: "arrive", history });
    const times = p.map((x) => new Date(x.iso).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(25 * 60_000);
    }
  });

  it("respects the arrive-by lead time so a promise is still actionable", () => {
    const p = buildTimePresets({ nowMs: now, mode: "arrive" });
    expect(new Date(p[0]!.iso).getTime() - now).toBeGreaterThanOrEqual(30 * 60_000);
  });
});
