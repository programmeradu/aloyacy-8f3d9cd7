import { describe, expect, it } from "vitest";
import {
  aggregateScores,
  BACKTEST_WINDOW_DAYS,
  bandCoveragePct,
  headlineAggs,
  horizonBucket,
  isHeadlineSource,
  MIN_HORIZON_SEC,
  scorePair,
  scorePredictions,
  type PredictionRow,
  type TruthRow,
} from "./eta-backtest";

const T0 = Date.parse("2026-08-28T10:00:00.000Z");

function pred(over: Partial<PredictionRow> = {}): PredictionRow {
  return {
    tripId: "trip-1",
    stopId: "stop-a",
    routeId: "NPT:31",
    createdAtMs: T0,
    horizonSec: 180,
    p50Sec: 180,
    p25Sec: 120,
    p90Sec: 300,
    tier: "live",
    operatorEtaSec: 240,
    modelVersionId: "v1",
    hourOfDay: 13,
    dayOfWeek: 5,
    ...over,
  };
}

function truth(over: Partial<TruthRow> = {}): TruthRow {
  return {
    tripId: "trip-1",
    stopId: "stop-a",
    actualArrivalMs: T0 + 200_000,
    source: "vehicle",
    ...over,
  };
}

describe("horizonBucket", () => {
  it("splits the five bands the accuracy page will use", () => {
    expect(horizonBucket(30)).toBe("0-2m");
    expect(horizonBucket(119)).toBe("0-2m");
    expect(horizonBucket(120)).toBe("2-5m");
    expect(horizonBucket(300)).toBe("5-10m");
    expect(horizonBucket(600)).toBe("10-20m");
    expect(horizonBucket(1200)).toBe("20m+");
  });
});

describe("scorePair", () => {
  it("is actual minus predicted: late bus is a positive (optimistic) error", () => {
    // We said 180s; bus came at 200s → +20s.
    const scored = scorePair(pred(), truth());
    expect(scored).not.toBeNull();
    expect(scored!.errorSec).toBe(20);
    expect(scored!.absErrorSec).toBe(20);
    expect(scored!.horizonBucket).toBe("2-5m");
    expect(scored!.inBand).toBe(true);
  });

  it("drops a row that is no longer a prediction", () => {
    expect(scorePair(pred({ createdAtMs: T0 + 201_000 }), truth())).toBeNull();
  });

  it("drops a horizon shorter than the sample floor", () => {
    expect(
      scorePair(pred({ horizonSec: MIN_HORIZON_SEC - 1, p50Sec: MIN_HORIZON_SEC - 1 }), truth()),
    ).toBeNull();
  });

  it("leaves the band unknown when p25/p90 were not shown", () => {
    const scored = scorePair(pred({ p25Sec: null, p90Sec: null }), truth());
    expect(scored!.inBand).toBeNull();
  });

  it("marks a miss when the actual falls outside p25–p90", () => {
    const scored = scorePair(
      pred({ p50Sec: 180, p25Sec: 160, p90Sec: 190 }),
      truth({ actualArrivalMs: T0 + 400_000 }),
    );
    expect(scored!.inBand).toBe(false);
    expect(scored!.errorSec).toBe(220);
  });

  it("scores the operator on the same clock", () => {
    // Operator said 240s; bus came at 200s → |−40| = 40.
    const scored = scorePair(pred(), truth());
    expect(scored!.operatorAbsErrorSec).toBe(40);
  });
});

describe("scorePredictions", () => {
  it("joins on trip and stop, and scores every sampled horizon", () => {
    const pairs = scorePredictions(
      [
        pred({ horizonSec: 180, p50Sec: 180 }),
        pred({ createdAtMs: T0 - 400_000, horizonSec: 600, p50Sec: 600 }),
        pred({ tripId: "other", stopId: "stop-a" }),
      ],
      [truth()],
    );
    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.horizonBucket).sort()).toEqual(["10-20m", "2-5m"]);
  });
});

describe("aggregateScores", () => {
  it("keeps inferred arrivals out of the vehicle bucket", () => {
    const pairs = scorePredictions(
      [pred(), pred({ tripId: "trip-2", stopId: "stop-b", p50Sec: 100, horizonSec: 100 })],
      [
        truth(),
        truth({
          tripId: "trip-2",
          stopId: "stop-b",
          source: "inferred",
          actualArrivalMs: T0 + 400_000,
        }),
      ],
    );
    const aggs = aggregateScores(pairs);
    expect(aggs).toHaveLength(2);
    const vehicle = aggs.find((a) => a.truthSource === "vehicle")!;
    const inferred = aggs.find((a) => a.truthSource === "inferred")!;
    expect(vehicle.n).toBe(1);
    expect(vehicle.maeSec).toBe(20);
    expect(inferred.n).toBe(1);
    expect(headlineAggs(aggs)).toEqual([vehicle]);
    expect(isHeadlineSource("inferred")).toBe(false);
  });

  it("reports MAE, median, bias, band coverage and beat-the-operator", () => {
    // Three live 2–5m predictions on the same route/hour.
    // errors: +20, −10, +40  → mae 23, bias +17, median abs 20.
    const preds = [
      pred({ p50Sec: 180, horizonSec: 180, operatorEtaSec: 240 }),
      pred({
        tripId: "t2",
        stopId: "s2",
        p50Sec: 180,
        horizonSec: 180,
        operatorEtaSec: 100,
      }),
      pred({
        tripId: "t3",
        stopId: "s3",
        p50Sec: 180,
        horizonSec: 180,
        operatorEtaSec: 180,
      }),
    ];
    const truths = [
      truth({ actualArrivalMs: T0 + 200_000 }),
      truth({ tripId: "t2", stopId: "s2", actualArrivalMs: T0 + 170_000 }),
      truth({ tripId: "t3", stopId: "s3", actualArrivalMs: T0 + 220_000 }),
    ];
    const [row] = aggregateScores(scorePredictions(preds, truths));
    expect(row!.n).toBe(3);
    expect(row!.maeSec).toBe(23);
    expect(row!.medianAbsSec).toBe(20);
    expect(row!.biasSec).toBe(17);
    expect(row!.bandN).toBe(3);
    expect(row!.bandHits).toBe(3);
    expect(row!.operatorN).toBe(3);
    // our abs: 20, 10, 40 (mean 23). operator abs: 40, 70, 40 (mean 50).
    expect(row!.operatorMaeSec).toBe(50);
    expect(row!.beatDeltaSec).toBe(-27);
    expect(bandCoveragePct([row!])).toBe(100);
  });

  it("does not invent an operator comparison when the feed was silent", () => {
    const [row] = aggregateScores(scorePredictions([pred({ operatorEtaSec: null })], [truth()]));
    expect(row!.operatorN).toBe(0);
    expect(row!.operatorMaeSec).toBeNull();
    expect(row!.beatDeltaSec).toBeNull();
  });
});

describe("window", () => {
  it("looks back two weeks, not forever", () => {
    expect(BACKTEST_WINDOW_DAYS).toBe(14);
  });
});
