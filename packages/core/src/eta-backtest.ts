// A3 backtest. Join a rendered prediction to a measured arrival and
// roll the errors into bounded aggregates. Pure — no clock, no I/O.
//
// Error is actual − predicted. Positive = we were optimistic (the bus
// arrived later than the number we showed). Inferred arrivals stay in
// their own source bucket so they can never inflate a headline n.

export const MIN_HORIZON_SEC = 30;
export const BACKTEST_WINDOW_DAYS = 14;

export const HORIZON_BUCKETS = [
  { id: "0-2m", minSec: 0, maxSec: 120 },
  { id: "2-5m", minSec: 120, maxSec: 300 },
  { id: "5-10m", minSec: 300, maxSec: 600 },
  { id: "10-20m", minSec: 600, maxSec: 1200 },
  { id: "20m+", minSec: 1200, maxSec: Number.POSITIVE_INFINITY },
] as const;

export type HorizonBucketId = (typeof HORIZON_BUCKETS)[number]["id"];

/** Sources that may appear on a public accuracy page. */
export const HEADLINE_TRUTH_SOURCES = ["vehicle", "rider"] as const;
export type HeadlineTruthSource = (typeof HEADLINE_TRUTH_SOURCES)[number];

export function isHeadlineSource(source: string): source is HeadlineTruthSource {
  return source === "vehicle" || source === "rider";
}

export type PredictionRow = {
  tripId: string;
  stopId: string;
  routeId: string;
  createdAtMs: number;
  horizonSec: number;
  p50Sec: number;
  p25Sec: number | null;
  p90Sec: number | null;
  tier: string;
  operatorEtaSec: number | null;
  modelVersionId: string | null;
  hourOfDay: number;
  dayOfWeek: number;
};

export type TruthRow = {
  tripId: string;
  stopId: string;
  actualArrivalMs: number;
  source: string;
};

export type ScoredPair = {
  routeId: string;
  hourOfDay: number;
  dayOfWeek: number;
  tier: string;
  horizonBucket: HorizonBucketId;
  truthSource: string;
  modelVersionId: string;
  errorSec: number;
  absErrorSec: number;
  horizonSec: number;
  inBand: boolean | null;
  operatorAbsErrorSec: number | null;
};

export type AccuracyAgg = {
  routeId: string;
  hourOfDay: number;
  dayOfWeek: number;
  tier: string;
  horizonBucket: HorizonBucketId;
  truthSource: string;
  modelVersionId: string;
  n: number;
  maeSec: number;
  medianAbsSec: number;
  biasSec: number;
  maePctOfHorizon: number | null;
  bandHits: number;
  bandN: number;
  operatorN: number;
  operatorMaeSec: number | null;
  beatDeltaSec: number | null;
};

export function horizonBucket(horizonSec: number): HorizonBucketId {
  for (const b of HORIZON_BUCKETS) {
    if (horizonSec >= b.minSec && horizonSec < b.maxSec) return b.id;
  }
  return "20m+";
}

export function truthKey(tripId: string, stopId: string): string {
  return `${tripId}|${stopId}`;
}

function roundSec(n: number): number {
  return Math.round(n);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

export function scorePair(pred: PredictionRow, truth: TruthRow): ScoredPair | null {
  if (pred.tripId !== truth.tripId || pred.stopId !== truth.stopId) return null;
  if (pred.horizonSec < MIN_HORIZON_SEC) return null;
  if (pred.createdAtMs >= truth.actualArrivalMs) return null;
  const predictedMs = pred.createdAtMs + pred.p50Sec * 1000;
  const errorSec = (truth.actualArrivalMs - predictedMs) / 1000;
  if (!Number.isFinite(errorSec)) return null;

  let inBand: boolean | null = null;
  if (pred.p25Sec != null && pred.p90Sec != null) {
    const lo = pred.createdAtMs + pred.p25Sec * 1000;
    const hi = pred.createdAtMs + pred.p90Sec * 1000;
    inBand = truth.actualArrivalMs >= lo && truth.actualArrivalMs <= hi;
  }

  let operatorAbsErrorSec: number | null = null;
  if (pred.operatorEtaSec != null && pred.operatorEtaSec >= 0) {
    const opMs = pred.createdAtMs + pred.operatorEtaSec * 1000;
    operatorAbsErrorSec = Math.abs((truth.actualArrivalMs - opMs) / 1000);
  }

  return {
    routeId: pred.routeId,
    hourOfDay: pred.hourOfDay,
    dayOfWeek: pred.dayOfWeek,
    tier: pred.tier,
    horizonBucket: horizonBucket(pred.horizonSec),
    truthSource: truth.source,
    modelVersionId: pred.modelVersionId ?? "",
    errorSec,
    absErrorSec: Math.abs(errorSec),
    horizonSec: pred.horizonSec,
    inBand,
    operatorAbsErrorSec,
  };
}

export function scorePredictions(predictions: PredictionRow[], truths: TruthRow[]): ScoredPair[] {
  const byStop = new Map<string, TruthRow>();
  for (const t of truths) byStop.set(truthKey(t.tripId, t.stopId), t);
  const out: ScoredPair[] = [];
  for (const pred of predictions) {
    const truth = byStop.get(truthKey(pred.tripId, pred.stopId));
    if (!truth) continue;
    const scored = scorePair(pred, truth);
    if (scored) out.push(scored);
  }
  return out;
}

function aggKey(p: ScoredPair): string {
  return [
    p.routeId,
    p.hourOfDay,
    p.dayOfWeek,
    p.tier,
    p.horizonBucket,
    p.truthSource,
    p.modelVersionId,
  ].join("|");
}

export function aggregateScores(pairs: ScoredPair[]): AccuracyAgg[] {
  const groups = new Map<string, ScoredPair[]>();
  for (const p of pairs) {
    const k = aggKey(p);
    const arr = groups.get(k) ?? [];
    arr.push(p);
    groups.set(k, arr);
  }
  const out: AccuracyAgg[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    const abs = group.map((p) => p.absErrorSec);
    const signed = group.map((p) => p.errorSec);
    const banded = group.filter((p) => p.inBand !== null);
    const withOp = group.filter((p) => p.operatorAbsErrorSec != null);
    const horizons = group.map((p) => p.absErrorSec / Math.max(p.horizonSec, 1));
    const ourMaeOnOp = withOp.length ? mean(withOp.map((p) => p.absErrorSec)) : null;
    const opMae = withOp.length ? mean(withOp.map((p) => p.operatorAbsErrorSec!)) : null;
    out.push({
      routeId: first.routeId,
      hourOfDay: first.hourOfDay,
      dayOfWeek: first.dayOfWeek,
      tier: first.tier,
      horizonBucket: first.horizonBucket,
      truthSource: first.truthSource,
      modelVersionId: first.modelVersionId,
      n: group.length,
      maeSec: roundSec(mean(abs)),
      medianAbsSec: median(abs.map(roundSec)),
      biasSec: roundSec(mean(signed)),
      maePctOfHorizon: group.length ? roundSec(mean(horizons) * 100) : null,
      bandHits: banded.filter((p) => p.inBand).length,
      bandN: banded.length,
      operatorN: withOp.length,
      operatorMaeSec: opMae == null ? null : roundSec(opMae),
      beatDeltaSec: ourMaeOnOp == null || opMae == null ? null : roundSec(ourMaeOnOp - opMae),
    });
  }
  return out.sort((a, b) => {
    if (a.routeId !== b.routeId) return a.routeId.localeCompare(b.routeId);
    if (a.n !== b.n) return b.n - a.n;
    return a.horizonBucket.localeCompare(b.horizonBucket);
  });
}

export function headlineAggs(aggs: AccuracyAgg[]): AccuracyAgg[] {
  return aggs.filter((a) => isHeadlineSource(a.truthSource));
}

export function bandCoveragePct(aggs: AccuracyAgg[]): number | null {
  let hits = 0;
  let n = 0;
  for (const a of aggs) {
    hits += a.bandHits;
    n += a.bandN;
  }
  if (n === 0) return null;
  return roundSec((hits / n) * 100);
}
