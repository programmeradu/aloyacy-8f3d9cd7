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
  type ScheduledDiagnostics,
  NoScheduleAvailableError,
} from "./journey-scheduled.server";
import { getSkippedTransferCount } from "./overrides.server";
import type { Itinerary, RideLeg } from "./itinerary-types";
import { annotateRationales } from "./itinerary-rationale";

const PointSchema = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  label: z.string().max(200).optional(),
});

const InputSchema = z.object({
  from: PointSchema,
  to: PointSchema,
  debug: z.boolean().optional(),
  mode: z.enum(["live", "scheduled", "both"]).optional(),
  /** Unix seconds. Plan trips departing at/after this time. */
  departAtUnix: z.number().int().positive().optional(),
  /** Unix seconds. Plan trips arriving at/before this time. */
  arriveByUnix: z.number().int().positive().optional(),
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
    afterDedup: number;
    prunedMediocre: number;
    finalCount: number;
  };
};

const TOP_K = 5;
const MAX_TOTAL_JOURNEY_SEC = 300 * 60;
const FUTURE_THRESHOLD_SEC = 20 * 60; // beyond this, skip live and use scheduled only
const AIRPORT_RE = /\b(airport|terminal)\b/i;
const AIRPORT_EXTRA_TRANSFER_MIN_SAVINGS_SEC = 45 * 60;

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

    // Resolve target departure. arriveBy → back off by 90 min as a search anchor.
    let departureUnix = data.departAtUnix ?? null;
    if (!departureUnix && data.arriveByUnix) {
      departureUnix = Math.max(nowSec, data.arriveByUnix - 90 * 60);
    }
    const isFuture = departureUnix !== null && departureUnix - nowSec > FUTURE_THRESHOLD_SEC;

    // Live realtime is only meaningful for "leave now"; future trips go scheduled-only.
    const mode = data.mode ?? (isFuture ? "scheduled" : "both");

    type LiveR = { itineraries: Itinerary[]; diagnostics?: MultiLegDiagnostics } | null;
    type SchedR = { itineraries: Itinerary[]; diagnostics: ScheduledDiagnostics } | null;

    const livePromise: Promise<LiveR> =
      mode === "live" || mode === "both"
        ? planMultiLegJourney(data.from, data.to, { collectDiagnostics: data.debug ?? false })
            .catch((e: unknown) => { console.warn("[multileg] live failed:", (e as Error).message); return null; })
        : Promise.resolve(null);
    let noScheduleAvailable = false;
    let requestedDate: string | undefined;
    const schedPromise: Promise<SchedR> =
      mode === "scheduled" || mode === "both"
        ? planMultiLegScheduled(data.from, data.to, departureUnix ? { departureUnix, explicitTime: !!(data.departAtUnix || data.arriveByUnix) } : undefined)
            .catch((e: unknown) => {
              if (e instanceof NoScheduleAvailableError) {
                noScheduleAvailable = true;
                requestedDate = e.date;
                console.warn("[multileg] no schedule shard for", e.date);
                return null;
              }
              console.warn("[multileg] scheduled failed:", (e as Error).message);
              return null;
            })
        : Promise.resolve(null);

    const [liveResult, schedResult] = await Promise.all([livePromise, schedPromise]);

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
    for (const it of merged) {
      if (it.totalDurationSec > MAX_TOTAL_JOURNEY_SEC) continue;
      // Honour arrive-by: 10 min slack so a near-miss still shows with a warning upstream.
      if (data.arriveByUnix && it.arrivalUnix > data.arriveByUnix + 600) continue;
      // Honour depart-at: keep options that depart within 2h of the requested time.
      if (departureUnix && it.departureUnix < departureUnix - 300) continue;
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
    const afterDedup = dedup.size;

    // No-mediocrity: a transfer itinerary must beat best direct by ≥ 3min or ≥ 15%.
    const all = [...dedup.values()];
    const bestDirect = all
      .filter((it) => it.transfers === 0)
      .reduce<Itinerary | null>((best, it) => (!best || it.score < best.score ? it : best), null);
    let kept = all;
    if (bestDirect) {
      kept = all.filter((it) => {
        if (it.transfers === 0) return true;
        const margin = bestDirect.totalDurationSec - it.totalDurationSec;
        const pct = margin / bestDirect.totalDurationSec;
        return margin >= 180 || pct >= 0.15;
      });
    }
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
            afterDedup,
            prunedMediocre,
            finalCount: top.length,
          }
        : undefined,
    };
  });
