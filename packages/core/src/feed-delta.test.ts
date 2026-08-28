import { describe, expect, it } from "vitest";
import { cyWallToMs } from "./cy-time";
import { stop as stopEn } from "./dictionaries/en/stop";
import {
  FEED_DELTA_MAX_GAP_SEC,
  FEED_DELTA_MIN_M,
  FEED_MPS,
  FEED_SPEAK_MIN_N,
  FEED_SPEAK_MIN_SEC,
  bucketPairs,
  feedDeltaLine,
  feedDeltaMinutes,
  pairFeedAndRider,
  pickFeedDeltaHints,
  pingDelta,
  shouldSpeakFeedDelta,
  type FeedPing,
  type RiderFix,
} from "./feed-delta";

const HERE = { lat: 35.17, lng: 33.36 };

function north(meters: number) {
  return { lat: HERE.lat + meters / 111_320, lng: HERE.lng };
}

function feed(partial: Partial<FeedPing> & { tMs: number }): FeedPing {
  return { tripId: "t1", routeId: "30", ...HERE, ...partial };
}

function rider(partial: Partial<RiderFix> & { tMs: number }): RiderFix {
  return { tripId: "t1", ...HERE, ...partial };
}

describe("pingDelta", () => {
  it("is unsigned metres over 8 m/s", () => {
    const { deltaM, deltaSec } = pingDelta(HERE, north(80));
    expect(deltaM).toBeGreaterThan(79);
    expect(deltaM).toBeLessThan(81);
    expect(deltaSec).toBeCloseTo(deltaM / FEED_MPS, 6);
  });
});

describe("pairFeedAndRider", () => {
  it("pairs the closest unused feed ping within 20 s, same trip", () => {
    const pairs = pairFeedAndRider(
      [feed({ tMs: 1_000_000, ...north(0) }), feed({ tMs: 1_030_000, ...north(200) })],
      [rider({ tMs: 1_005_000, ...north(80) }), rider({ tMs: 1_025_000, ...north(280) })],
    );
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.deltaM).toBeGreaterThan(FEED_DELTA_MIN_M);
    expect(pairs[1]!.deltaM).toBeGreaterThan(FEED_DELTA_MIN_M);
  });

  it("does not reuse a ping when two riders claim it", () => {
    const pairs = pairFeedAndRider(
      [feed({ tMs: 1_000_000, ...north(0) })],
      [rider({ tMs: 1_005_000, ...north(80) }), rider({ tMs: 1_010_000, ...north(90) })],
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.tMs).toBe(1_005_000);
  });

  it("ignores a different trip, a 21 s gap, and a 10 m wobble", () => {
    expect(
      pairFeedAndRider(
        [feed({ tripId: "a", tMs: 1_000_000, ...north(0) })],
        [rider({ tripId: "b", tMs: 1_000_000, ...north(80) })],
      ),
    ).toHaveLength(0);
    expect(
      pairFeedAndRider(
        [feed({ tMs: 1_000_000, ...north(0) })],
        [rider({ tMs: 1_000_000 + (FEED_DELTA_MAX_GAP_SEC + 1) * 1000, ...north(80) })],
      ),
    ).toHaveLength(0);
    expect(
      pairFeedAndRider(
        [feed({ tMs: 1_000_000, ...north(0) })],
        [rider({ tMs: 1_000_000, ...north(10) })],
      ),
    ).toHaveLength(0);
  });
});

describe("pickFeedDeltaHints", () => {
  const evening = cyWallToMs(2026, 8, 27, 19, 0); // Thursday 19:00 Cyprus

  it("stays silent below eight samples or two minutes", () => {
    expect(FEED_SPEAK_MIN_N).toBe(8);
    expect(FEED_SPEAK_MIN_SEC).toBe(120);
    expect(shouldSpeakFeedDelta(7, 180)).toBe(false);
    expect(shouldSpeakFeedDelta(10, 90)).toBe(false);
    const { hour, dow } = { hour: 19, dow: 4 };
    expect(
      pickFeedDeltaHints(
        [{ routeId: "30", hour, dow, meanDeltaM: 400, meanDeltaSec: 50, n: 20 }],
        evening,
      ),
    ).toHaveLength(0);
  });

  it("speaks an unsigned 'off' as Bus 30, never optimistic", () => {
    const { hour, dow } = { hour: 19, dow: 4 };
    const hints = pickFeedDeltaHints(
      [{ routeId: "30", hour, dow, meanDeltaM: 1600, meanDeltaSec: 200, n: 10 }],
      evening,
    );
    expect(hints).toEqual([{ routeId: "30", minutes: 3, n: 10 }]);
    expect(feedDeltaMinutes(200)).toBe(3);
    const line = feedDeltaLine("30", hints[0]!.minutes);
    expect(line).toBe(
      "The official clock on Bus 30 is usually about 3 min off this hour. We trust a rider on board.",
    );
    expect(stopEn["stop.feedDelta"]).toBe(
      "The official clock on Bus {route} is usually about {m} min off this hour. We trust a rider on board.",
    );
    expect(line).not.toMatch(/optimistic|late|early|This 30|The 30/i);
  });

  it("buckets a pair in Asia/Nicosia, not UTC", () => {
    const tMs = cyWallToMs(2026, 8, 23, 16, 0); // Sunday 16:00 Cyprus
    const pairs = pairFeedAndRider([feed({ tMs, ...north(0) })], [rider({ tMs, ...north(160) })]);
    const buckets = bucketPairs(pairs);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.hour).toBe(16);
    expect(buckets[0]!.dow).toBe(0);
  });
});
