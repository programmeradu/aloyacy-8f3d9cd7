// A3 write path. Load the ledger, score it, replace eta_accuracy.
// Inferred arrivals stay in their own rows — never mixed into headline n.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BACKTEST_WINDOW_DAYS,
  aggregateScores,
  scorePredictions,
  type AccuracyAgg,
  type PredictionRow,
  type TruthRow,
} from "@aloya/core/eta-backtest";
import { createLogger } from "./logger";

const db = supabaseAdmin as unknown as SupabaseClient;
const log = createLogger("eta-backtest");

const PAGE = 1000;
const MAX_PREDICTIONS = 20_000;
const MAX_TRUTH = 8_000;

type PredDb = {
  trip_id: string;
  stop_id: string;
  route_id: string;
  created_at: string;
  horizon_sec: number;
  p50_sec: number;
  p25_sec: number | null;
  p90_sec: number | null;
  tier: string;
  operator_eta_sec: number | null;
  model_version_id: string | null;
  hour_of_day: number;
  day_of_week: number;
};

type TruthDb = {
  trip_id: string;
  stop_id: string;
  actual_arrival: string;
  source: string;
};

async function pageRows<T>(
  table: string,
  select: string,
  sinceIso: string,
  sinceCol: string,
  orderCol: string,
  cap: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select(select)
      .gte(sinceCol, sinceIso)
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      log.error("page failed", error, { table });
      break;
    }
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out.slice(0, cap);
}

function asPrediction(row: PredDb): PredictionRow {
  return {
    tripId: row.trip_id,
    stopId: row.stop_id,
    routeId: row.route_id,
    createdAtMs: new Date(row.created_at).getTime(),
    horizonSec: row.horizon_sec,
    p50Sec: row.p50_sec,
    p25Sec: row.p25_sec,
    p90Sec: row.p90_sec,
    tier: row.tier,
    operatorEtaSec: row.operator_eta_sec,
    modelVersionId: row.model_version_id,
    hourOfDay: row.hour_of_day,
    dayOfWeek: row.day_of_week,
  };
}

function asTruth(row: TruthDb): TruthRow {
  return {
    tripId: row.trip_id,
    stopId: row.stop_id,
    actualArrivalMs: new Date(row.actual_arrival).getTime(),
    source: row.source,
  };
}

function dbRow(agg: AccuracyAgg, computedAt: string) {
  return {
    route_id: agg.routeId,
    hour_of_day: agg.hourOfDay,
    day_of_week: agg.dayOfWeek,
    tier: agg.tier,
    horizon_bucket: agg.horizonBucket,
    truth_source: agg.truthSource,
    model_version_id: agg.modelVersionId,
    n: agg.n,
    mae_sec: agg.maeSec,
    median_abs_sec: agg.medianAbsSec,
    bias_sec: agg.biasSec,
    mae_pct_of_horizon: agg.maePctOfHorizon,
    band_hits: agg.bandHits,
    band_n: agg.bandN,
    operator_n: agg.operatorN,
    operator_mae_sec: agg.operatorMaeSec,
    beat_delta_sec: agg.beatDeltaSec,
    computed_at: computedAt,
  };
}

export async function runEtaBacktest(nowMs = Date.now()): Promise<{
  predictions: number;
  truth: number;
  scored: number;
  rows: number;
}> {
  const sinceIso = new Date(nowMs - BACKTEST_WINDOW_DAYS * 24 * 3600_000).toISOString();
  const preds = await pageRows<PredDb>(
    "eta_predictions",
    "trip_id, stop_id, route_id, created_at, horizon_sec, p50_sec, p25_sec, p90_sec, tier, operator_eta_sec, model_version_id, hour_of_day, day_of_week",
    sinceIso,
    "created_at",
    "created_at",
    MAX_PREDICTIONS,
  );
  const truths = await pageRows<TruthDb>(
    "arrival_truth",
    "trip_id, stop_id, actual_arrival, source",
    sinceIso,
    "actual_arrival",
    "actual_arrival",
    MAX_TRUTH,
  );
  const scored = scorePredictions(preds.map(asPrediction), truths.map(asTruth));
  const aggs = aggregateScores(scored);
  const computedAt = new Date(nowMs).toISOString();
  const payload = aggs.map((a) => dbRow(a, computedAt));

  if (payload.length > 0) {
    const { error } = await db.from("eta_accuracy").upsert(payload, {
      onConflict:
        "route_id,hour_of_day,day_of_week,tier,horizon_bucket,truth_source,model_version_id",
    });
    if (error) {
      log.error("upsert failed", error, { rows: payload.length });
      return { predictions: preds.length, truth: truths.length, scored: scored.length, rows: 0 };
    }
    const { error: delErr } = await db.from("eta_accuracy").delete().lt("computed_at", computedAt);
    if (delErr) log.error("stale delete failed", delErr);
  }

  log.info("backtest wrote", {
    predictions: preds.length,
    truth: truths.length,
    scored: scored.length,
    rows: payload.length,
  });
  return {
    predictions: preds.length,
    truth: truths.length,
    scored: scored.length,
    rows: payload.length,
  };
}
