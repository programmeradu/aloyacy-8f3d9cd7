// Diagnostic server fn for the Phase 1 transfer graph checkpoint.
// Wraps the in-memory index builders so a route can read them without
// importing the .server module directly.

import { createServerFn } from "@tanstack/react-start";
import {
  getGraphStats,
  getStopRoutes,
  getTransferCandidates,
} from "./transfer-graph.server";
import { STOPS } from "./gtfs";

export type GraphDiagnostics = {
  buildMs: number;
  stats: ReturnType<typeof getGraphStats>;
  totalStops: number;
  /** Top 10 stops by candidate count — useful sanity check for hub stops. */
  topHubs: Array<{
    stopId: string;
    name: string;
    candidateCount: number;
    nearestMeters: number;
    farthestMeters: number;
  }>;
  /** Distribution of candidate counts across stops, bucketed. */
  histogram: Array<{ bucket: string; stops: number }>;
};

export const getTransferGraphDiagnostics = createServerFn({ method: "GET" }).handler(
  async (): Promise<GraphDiagnostics> => {
    const t0 = Date.now();
    getStopRoutes();
    const tc = getTransferCandidates();
    const buildMs = Date.now() - t0;

    const stopById = new Map(STOPS.map((s) => [s.id, s]));

    const hubs = [...tc.entries()]
      .map(([stopId, list]) => ({
        stopId,
        name: stopById.get(stopId)?.name ?? stopId,
        candidateCount: list.length,
        nearestMeters: list[0]?.straightLineMeters ?? 0,
        farthestMeters: list[list.length - 1]?.straightLineMeters ?? 0,
      }))
      .sort((a, b) => b.candidateCount - a.candidateCount)
      .slice(0, 10);

    const buckets = [
      { label: "1", lo: 1, hi: 1 },
      { label: "2 — 3", lo: 2, hi: 3 },
      { label: "4 — 5", lo: 4, hi: 5 },
      { label: "6 — 7", lo: 6, hi: 7 },
      { label: "8", lo: 8, hi: 8 },
    ];
    const histogram = buckets.map((b) => ({
      bucket: b.label,
      stops: [...tc.values()].filter((l) => l.length >= b.lo && l.length <= b.hi)
        .length,
    }));

    return {
      buildMs,
      stats: getGraphStats(),
      totalStops: STOPS.length,
      topHubs: hubs,
      histogram,
    };
  },
);
