// Shared learned-stats types. Previously split between `eta.ts` and
// `predictor.ts`; centralised here so the v2 ETA engine and the
// learning hooks share one definition.

/** Per-(route, stop, hour, dow) learned systematic delay in seconds. */
export type LearnedBias = {
  meanDelaySec: number;
  sampleCount: number;
};

/** Raw row shape returned from `delay_stats` server fns. */
export type LearnedStat = {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_delay_sec: number;
  sample_count: number;
};
