import { describe, expect, it } from "vitest";
import { stop as stopEn } from "./dictionaries/en/stop";
import { VEHICLE_CROSS_RADIUS_M } from "./vehicle-cross";
import {
  SKIP_MAX_CLASSIFY_GAP_MS,
  SKIP_MIN_N,
  SKIP_RADIUS_M,
  SKIP_SPEAK_MIN_PCT,
  classifyStopVisit,
  pickSkipRate,
  shouldSpeakSkip,
  skipPct,
  skipRateLine,
  skipFraction,
  skipMapKey,
  tallySkipVisits,
  type SkipVisitRow,
} from "./skip-rate";

const STOP = { lat: 35.17, lng: 33.36 };

function north(meters: number) {
  return { lat: STOP.lat + meters / 111_320, lng: STOP.lng };
}

describe("classifyStopVisit", () => {
  it("uses the same geofence as vehicle-cross", () => {
    expect(SKIP_RADIUS_M).toBe(VEHICLE_CROSS_RADIUS_M);
  });

  it("calls a dense pass-through a skip", () => {
    const t0 = 1_000_000;
    const hit = classifyStopVisit(
      [
        { tMs: t0, ...north(100) },
        { tMs: t0 + 8_000, ...north(30) },
        { tMs: t0 + 16_000, ...north(100) },
      ],
      STOP,
    );
    expect(hit?.outcome).toBe("skipped");
    expect(hit!.dwellSec).toBeLessThan(12);
    expect(hit!.gapMs).toBeLessThanOrEqual(SKIP_MAX_CLASSIFY_GAP_MS);
  });

  it("calls a kerb dwell served", () => {
    const t0 = 1_000_000;
    const hit = classifyStopVisit(
      [
        { tMs: t0, ...north(120) },
        { tMs: t0 + 10_000, ...north(20) },
        { tMs: t0 + 28_000, ...north(15) },
        { tMs: t0 + 40_000, ...north(120) },
      ],
      STOP,
    );
    expect(hit?.outcome).toBe("served");
    expect(hit!.dwellSec).toBeGreaterThanOrEqual(12);
  });

  it("stays silent on a sparse gap that could hide a dwell", () => {
    const t0 = 1_000_000;
    expect(
      classifyStopVisit(
        [
          { tMs: t0, ...north(200) },
          { tMs: t0 + 50_000, ...north(55) },
          { tMs: t0 + 100_000, ...north(200) },
        ],
        STOP,
      ),
    ).toBeNull();
  });

  it("stays silent when the bus never leaves, and when it never enters", () => {
    const t0 = 1_000_000;
    expect(
      classifyStopVisit(
        [
          { tMs: t0, ...north(120) },
          { tMs: t0 + 10_000, ...north(20) },
        ],
        STOP,
      ),
    ).toBeNull();
    expect(
      classifyStopVisit(
        [
          { tMs: t0, ...north(200) },
          { tMs: t0 + 10_000, ...north(150) },
        ],
        STOP,
      ),
    ).toBeNull();
  });
});

describe("pickSkipRate", () => {
  const evening = Date.UTC(2026, 7, 27, 16, 0); // 19:00 Cyprus (UTC+3)

  function visits(skipped: number, served: number): SkipVisitRow[] {
    const rows: SkipVisitRow[] = [];
    for (let i = 0; i < skipped; i++) {
      rows.push({
        stopId: "1009",
        routeId: "30",
        outcome: "skipped",
        classifiedAt: evening,
        hour: 19,
        dow: 4,
      });
    }
    for (let i = 0; i < served; i++) {
      rows.push({
        stopId: "1009",
        routeId: "30",
        outcome: "served",
        classifiedAt: evening,
        hour: 19,
        dow: 4,
      });
    }
    return rows;
  }

  it("stays silent below eight visits or 15%", () => {
    expect(SKIP_MIN_N).toBe(8);
    expect(SKIP_SPEAK_MIN_PCT).toBe(15);
    expect(shouldSpeakSkip(7, 40)).toBe(false);
    expect(shouldSpeakSkip(10, 10)).toBe(false);
    const slots = tallySkipVisits(visits(1, 9));
    expect(skipPct(1, 10)).toBe(10);
    expect(pickSkipRate(slots, "1009", "30", evening / 1000)).toBeNull();
  });

  it("speaks a 20% weekday-evening skip as Bus 30, not This 30", () => {
    const slots = tallySkipVisits(visits(2, 8));
    const hit = pickSkipRate(slots, "1009", "30", evening / 1000);
    expect(hit).toEqual({ routeId: "30", k: 5, n: 10, when: "weekdayEvening" });
    const line = skipRateLine("30", hit!.k, "on weekday evenings");
    expect(line).toBe("Bus 30 skips this stop about 1 in 5 on weekday evenings. Wave clearly.");
    expect(stopEn["stop.skipRate"]).toBe(
      "Bus {route} skips this stop about 1 in {k} {when}. Wave clearly.",
    );
    expect(line).not.toMatch(/This 30|The 30|€|taxi|RAPTOR|Green Line|luggage/i);
  });

  it("turns 1 in 5 into a fifth, and nothing below the speak bar", () => {
    expect(skipFraction(5)).toBe(0.2);
    expect(skipFraction(1)).toBe(0);
    expect(skipMapKey("1009", "30")).toBe("1009\t30");
  });
});
