// Measured service frequency.
//
// How much a change costs depends almost entirely on how often the connecting
// route runs: joining a bus every 10 minutes is a minor risk, joining one that
// runs twice an hour is a gamble. Rather than assume a constant, we measure
// the gaps the live feed actually shows and use the median, which shrugs off
// the one bunched pair or the single long gap at the end of a service window.

export type HeadwaySample = {
  routeId: string;
  stopId: string;
  /** Seconds since epoch for a scheduled/predicted departure. */
  timeUnix: number;
};

const MIN_PLAUSIBLE_GAP_SEC = 60; // below this the two records are the same bus
const MAX_PLAUSIBLE_GAP_SEC = 3 * 60 * 60;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Build a routeId → typical seconds-between-departures lookup from whatever
 * departures are visible. Returns null for routes with too little evidence,
 * so the scorer can fall back to a neutral assumption rather than a guess
 * dressed up as a measurement.
 */
export function buildHeadwayIndex(samples: HeadwaySample[]): Map<string, number> {
  // Gaps are only meaningful within one route at one stop.
  const byRouteStop = new Map<string, number[]>();
  for (const s of samples) {
    const key = `${s.routeId}\u0000${s.stopId}`;
    const list = byRouteStop.get(key);
    if (list) list.push(s.timeUnix);
    else byRouteStop.set(key, [s.timeUnix]);
  }

  const gapsByRoute = new Map<string, number[]>();
  for (const [key, times] of byRouteStop) {
    if (times.length < 2) continue;
    const routeId = key.slice(0, key.indexOf("\u0000"));
    times.sort((a, b) => a - b);
    const gaps = gapsByRoute.get(routeId) ?? [];
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      if (gap >= MIN_PLAUSIBLE_GAP_SEC && gap <= MAX_PLAUSIBLE_GAP_SEC) gaps.push(gap);
    }
    if (gaps.length > 0) gapsByRoute.set(routeId, gaps);
  }

  const out = new Map<string, number>();
  for (const [routeId, gaps] of gapsByRoute) {
    const m = median(gaps);
    if (m !== null) out.set(routeId, m);
  }
  return out;
}
