// Server-fn wrapper for the multi-leg planner so it can be called from routes.
//
// Phase 2c: returns BOTH realtime and scheduled results merged + deduped +
// pruned by the no-mediocrity filter. The realtime path covers the next ~60
// min with high accuracy; the scheduled path unlocks intercity and farther
// future. Together they give honest coverage at every distance.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planMultiLegJourney, type MultiLegDiagnostics } from "./journey-multileg.server";
import {
  planMultiLegScheduled,
  localDateForUnix,
  type ScheduledDiagnostics,
  NoScheduleAvailableError,
} from "./journey-scheduled.server";
import { getSkippedTransferCount } from "./overrides.server";
import type { Itinerary, RideLeg } from "./itinerary-types";
import { annotateRationales } from "./itinerary-rationale";
import { applyAccessibilityWeights } from "./accessibility-weights";
import { createLogger } from "./logger";
import { filterDominated } from "@aloya/core/plan-score";

const log = createLogger("multileg");

const PointSchema = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  label: z.string().max(200).optional(),
});

const A11ySchema = z
  .object({
    stepFree: z.boolean().optional(),
    preferShade: z.boolean().optional(),
    lowFloor: z.boolean().optional(),
    maxWalkMeters: z.number().int().min(100).max(3000).nullable().optional(),
  })
  .optional();

const InputSchema = z.object({
  from: PointSchema,
  to: PointSchema,
  debug: z.boolean().optional(),
  mode: z.enum(["live", "scheduled", "both"]).optional(),
  /** Unix seconds. Plan trips departing at/after this time. */
  departAtUnix: z.number().int().positive().optional(),
  /** Unix seconds. Plan trips arriving at/before this time. */
  arriveByUnix: z.number().int().positive().optional(),
  /** Wave 2.2 — accessibility weighting. Soft re-ranking only. */
  a11y: A11ySchema,
});

export type MultiLegResult = {
  itineraries: Itinerary[];
  searchedAt: number;
  elapsedMs: number;
  mode: "live" | "scheduled" | "both";
  /** True when the requested date has no timetable shard published yet. */
  noScheduleAvailable?: boolean;
  /** YYYYMMDD the planner tried to load when noScheduleAvailable is true. */
  requestedDate?: string;
  diagnostics?: {
    live?: MultiLegDiagnostics;
    scheduled?: ScheduledDiagnostics;
    mergedRaw: number;
    /** Candidates removed by the journey-cap / arrive-by / depart-at filters. */
    dropped?: { tooLong: number; arriveBy: number; departAt: number };
    afterDedup: number;

    prunedMediocre: number;
    finalCount: number;
  };
};

const TOP_K = 5;
const MAX_TOTAL_JOURNEY_SEC = 300 * 60;
const FUTURE_THRESHOLD_SEC = 20 * 60; // beyond this, skip live and use scheduled only
const ARRIVE_BY_BACKSEARCH_SEC = 6 * 3600;
const AIRPORT_RE = /\b(airport|terminal)\b/i;
const AIRPORT_EXTRA_TRANSFER_MIN_SAVINGS_SEC = 45 * 60;

/**
 * Time actually spent travelling, excluding the wait before the first bus.
 * An overnight or Sunday query legitimately waits hours for the first
 * departure; that wait must not count against the max-journey cap, or the
 * only real answer ("first bus at 05:40") gets pruned and the rider is told
 * no route exists.
 */
function travelSec(it: Itinerary): number {
  const firstRideIdx = it.legs.findIndex((l) => l.kind === "ride");
  if (firstRideIdx < 0) return it.totalDurationSec;
  const firstRide = it.legs[firstRideIdx] as RideLeg;
  let accessSec = 0;
  for (let i = 0; i < firstRideIdx; i++) {
    const l = it.legs[i];
    if (l.kind === "walk") accessSec += l.durationSec;
  }
  const start = firstRide.board.departureUnix - accessSec;
  return Math.max(0, it.arrivalUnix - start);
}

function isAirportQuery(point: { label?: string }): boolean {
  return AIRPORT_RE.test(point.label ?? "");
}

function pruneAirportTransferNoise(itineraries: Itinerary[]): Itinerary[] {
  if (itineraries.length <= 1) return itineraries;

  let kept = [...itineraries];
  const maxTransfers = Math.max(...kept.map((it) => it.transfers));

  for (let transfers = 1; transfers <= maxTransfers; transfers++) {
    const bestSimpler = kept
      .filter((it) => it.transfers < transfers)
      .reduce<Itinerary | null>(
        (best, it) => (!best || it.totalDurationSec < best.totalDurationSec ? it : best),
        null,
      );

    if (!bestSimpler) continue;

    kept = kept.filter((it) => {
      if (it.transfers < transfers) return true;
      const timeSavedVsSimpler = bestSimpler.totalDurationSec - it.totalDurationSec;
      return timeSavedVsSimpler >= AIRPORT_EXTRA_TRANSFER_MIN_SAVINGS_SEC;
    });
  }

  return kept;
}

export const planMultiLeg = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<MultiLegResult> => {
    const t0 = Date.now();
    const nowSec = Math.floor(Date.now() / 1000);

    // Resolve target departure. arriveBy searches backwards across a wider
    // window so first-mile feeds with sparse late-night service still catch
    // a coach without falling back to "no city bus".
    let departureUnix = data.departAtUnix ?? null;
    if (!departureUnix && data.arriveByUnix) {
      departureUnix = Math.max(nowSec, data.arriveByUnix - ARRIVE_BY_BACKSEARCH_SEC);
    }
    const isFuture = departureUnix !== null && departureUnix - nowSec > FUTURE_THRESHOLD_SEC;

    // Live realtime is only meaningful for "leave now"; future trips go scheduled-only.
    const mode = data.mode ?? (isFuture ? "scheduled" : "both");

    type LiveR = { itineraries: Itinerary[]; diagnostics?: MultiLegDiagnostics } | null;
    type SchedR = { itineraries: Itinerary[]; diagnostics: ScheduledDiagnostics } | null;

    // A planner that *crashed* is not the same claim as a corridor with no
    // service. We track the difference so an infrastructure hiccup never
    // renders as the honest-sounding lie "no bus serves this journey".
    let liveFailed = false;
    let schedFailed = false;

    const livePromise: Promise<LiveR> =
      mode === "live" || mode === "both"
        ? planMultiLegJourney(data.from, data.to, {
            collectDiagnostics: data.debug ?? false,
          }).catch((e: unknown) => {
            liveFailed = true;
            log.warn("live planner failed", { err: (e as Error).message });
            return null;
          })
        : Promise.resolve(null);
    let noScheduleAvailable = false;
    let requestedDate: string | undefined;
    const schedPromise: Promise<SchedR> =
      mode === "scheduled" || mode === "both"
        ? planMultiLegScheduled(
            data.from,
            data.to,
            departureUnix
              ? {
                  departureUnix,
                  explicitTime: !!(data.departAtUnix || data.arriveByUnix),
                  date: data.arriveByUnix ? localDateForUnix(data.arriveByUnix) : undefined,
                }
              : undefined,
          ).catch((e: unknown) => {
            if (e instanceof NoScheduleAvailableError) {
              noScheduleAvailable = true;
              requestedDate = e.date;
              log.warn("no schedule shard", { date: e.date });
              return null;
            }
            schedFailed = true;
            log.warn("scheduled planner failed", { err: (e as Error).message });
            return null;
          })
        : Promise.resolve(null);

    const [liveResult, schedResult] = await Promise.all([livePromise, schedPromise]);

    // Every engine we asked blew up: surface it so the client retries and the
    // rider sees "we couldn't reach the planner", not "no route exists".
    const liveAsked = mode === "live" || mode === "both";
    const schedAsked = mode === "scheduled" || mode === "both";
    const liveOk = liveAsked ? !liveFailed : true;
    const schedOk = schedAsked ? !schedFailed : true;
    if (!liveOk && !schedOk) {
      throw new Error("planner_unavailable");
    }


    const merged: Itinerary[] = [
      ...(liveResult?.itineraries ?? []),
      ...(schedResult?.itineraries ?? []),
    ];
    const learningMod = await import("./planner-learning.server");
    const learning = await learningMod.loadPlannerLearningContext(merged).catch(() => null);
    for (const it of merged) learningMod.rescoreItineraryWithLearning(it, learning);
    const mergedRaw = merged.length;

    // Dedupe by (signature). Prefer "live" or "mixed" over "estimated".
    const sourceRank = { live: 0, mixed: 1, estimated: 2 } as const;
    const dedup = new Map<string, Itinerary>();
    const dropped = { tooLong: 0, arriveBy: 0, departAt: 0 };
    const tooLong: Itinerary[] = [];
    for (const it of merged) {
      if (travelSec(it) > MAX_TOTAL_JOURNEY_SEC) {
        dropped.tooLong++;
        tooLong.push(it);
        continue;
      }
      // Honour arrive-by: 10 min slack so a near-miss still shows with a warning upstream.
      if (data.arriveByUnix && it.arrivalUnix > data.arriveByUnix + 600) {
        dropped.arriveBy++;
        continue;
      }
      // Honour depart-at: keep options that depart within 2h of the requested time.
      if (departureUnix && it.departureUnix < departureUnix - 300) {
        dropped.departAt++;
        continue;
      }
      const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
      const key = rides.map((r) => `${r.routeId}|${r.board.stopId}|${r.alight.stopId}`).join("→");
      const existing = dedup.get(key);
      if (
        !existing ||
        sourceRank[it.source] < sourceRank[existing.source] ||
        (sourceRank[it.source] === sourceRank[existing.source] && it.score < existing.score)
      ) {
        dedup.set(key, it);
      }
    }

    // Last-resort honesty: a sparse rural corridor can legitimately need a
    // long mid-journey wait (village services run a handful of times a day).
    // Pruning those to zero tells the rider "no route exists", which is a
    // lie. When the journey cap wiped out every option, keep the shortest
    // over-cap ones rather than returning an empty result.
    if (dedup.size === 0 && tooLong.length > 0) {
      const rescued = [...tooLong].sort((a, b) => travelSec(a) - travelSec(b)).slice(0, TOP_K);
      for (const it of rescued) {
        const rides = it.legs.filter((l): l is RideLeg => l.kind === "ride");
        const key = rides.map((r) => `${r.routeId}|${r.board.stopId}|${r.alight.stopId}`).join("→");
        if (!dedup.has(key)) dedup.set(key, it);
      }
    }
    const afterDedup = dedup.size;

    // The live and scheduled planners each only see their own candidate pool,
    // so dominance is applied once more over the merged set: an option is
    // dropped only when another arrives no later, with no more changes and no
    // more walking. Nothing is filtered for having a change, or for lacking
    // one — a direct ride survives because nothing beats it.
    const all = [...dedup.values()];
    let kept = filterDominated(all);
    const prunedMediocre = afterDedup - kept.length;

    // Learning loop: penalise transfer itineraries when riders have
    // repeatedly skipped the transfer for this exact OD pair. Each prior
    // skip adds 90 s of effective penalty, capped at 6 min, so a stubborn
    // transfer can still win if it's genuinely faster.
    const skips = await getSkippedTransferCount(data.from, data.to).catch(() => 0);
    if (skips >= 3) {
      const bias = Math.min(skips * 90, 360);
      for (const it of kept) {
        if (it.transfers > 0) it.score += bias;
      }
    }

    const airportQuery = isAirportQuery(data.to);
    if (airportQuery) {
      kept = pruneAirportTransferNoise(kept);
    }

    kept.sort((a, b) => {
      if (airportQuery && a.transfers !== b.transfers) {
        return a.transfers - b.transfers;
      }
      return a.score - b.score;
    });
    const top = kept.slice(0, TOP_K);

    // Wave 2.2 — accessibility weighting. Re-rank the top set so caps and
    // amenity preferences nudge the order without filtering anything out.
    if (data.a11y) {
      applyAccessibilityWeights(top, {
        stepFree: !!data.a11y.stepFree,
        preferShade: !!data.a11y.preferShade,
        lowFloor: !!data.a11y.lowFloor,
        maxWalkMeters: data.a11y.maxWalkMeters ?? null,
      });
      top.sort((a, b) => {
        if (airportQuery && a.transfers !== b.transfers) {
          return a.transfers - b.transfers;
        }
        return a.score - b.score;
      });
    }

    // Wave 2.4 — attach "Why this route?" rationale tags to each top option.
    annotateRationales(top);

    return {
      itineraries: top,
      searchedAt: Math.floor(Date.now() / 1000),
      elapsedMs: Date.now() - t0,
      mode,
      noScheduleAvailable: noScheduleAvailable && top.length === 0 ? true : undefined,
      requestedDate: noScheduleAvailable ? requestedDate : undefined,
      diagnostics: data.debug
        ? {
            live: liveResult?.diagnostics,
            scheduled: schedResult?.diagnostics,
            mergedRaw,
            dropped,
            afterDedup,

            prunedMediocre,
            finalCount: top.length,
          }
        : undefined,
    };
  });
