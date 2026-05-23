// Server-fn wrapper for the multi-leg planner so it can be called from routes.
//
// Phase 2c: returns BOTH realtime and scheduled results merged + deduped +
// pruned by the no-mediocrity filter. The realtime path covers the next ~60
// min with high accuracy; the scheduled path unlocks intercity and farther
// future. Together they give honest coverage at every distance.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planMultiLegJourney, type MultiLegDiagnostics } from "./journey-multileg.server";
import { planMultiLegScheduled, type ScheduledDiagnostics } from "./journey-scheduled.server";
import type { Itinerary, RideLeg } from "./itinerary-types";

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
});

export type MultiLegResult = {
  itineraries: Itinerary[];
  searchedAt: number;
  elapsedMs: number;
  mode: "live" | "scheduled" | "both";
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
const MAX_TOTAL_JOURNEY_SEC = 180 * 60;

export const planMultiLeg = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<MultiLegResult> => {
    const t0 = Date.now();
    const mode = data.mode ?? "both";

    const tasks: Promise<unknown>[] = [];
    let liveResult: { itineraries: Itinerary[]; diagnostics?: MultiLegDiagnostics } | null = null;
    let schedResult: { itineraries: Itinerary[]; diagnostics: ScheduledDiagnostics } | null = null;

    if (mode === "live" || mode === "both") {
      tasks.push(
        planMultiLegJourney(data.from, data.to, { collectDiagnostics: data.debug ?? false })
          .then((r) => { liveResult = r; })
          .catch((e) => { console.warn("[multileg] live failed:", (e as Error).message); }),
      );
    }
    if (mode === "scheduled" || mode === "both") {
      tasks.push(
        planMultiLegScheduled(data.from, data.to)
          .then((r) => { schedResult = r; })
          .catch((e) => { console.warn("[multileg] scheduled failed:", (e as Error).message); }),
      );
    }
    await Promise.all(tasks);

    // Merge → dedupe → no-mediocrity prune.
    const merged: Itinerary[] = [
      ...(liveResult?.itineraries ?? []),
      ...(schedResult?.itineraries ?? []),
    ];
    const mergedRaw = merged.length;

    // Dedupe by (signature). Prefer "live" or "mixed" over "estimated".
    const sourceRank = { live: 0, mixed: 1, estimated: 2 } as const;
    const dedup = new Map<string, Itinerary>();
    for (const it of merged) {
      if (it.totalDurationSec > MAX_TOTAL_JOURNEY_SEC) continue;
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
    kept.sort((a, b) => a.score - b.score);
    const top = kept.slice(0, TOP_K);

    return {
      itineraries: top,
      searchedAt: Math.floor(Date.now() / 1000),
      elapsedMs: Date.now() - t0,
      mode,
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
