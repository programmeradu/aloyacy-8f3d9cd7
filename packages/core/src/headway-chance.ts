// Headway as a chance, for when no vehicle is on the row.
//
// Observed gaps (route × stop × Cyprus hour × dow) beat the timetable.
// The chance is a survival curve: 1 − e^(−t/μ), with remaining wait
// shortened when the last bus was recent and scaled down when it is
// overdue. Pure — no clock, no I/O.

import { cyHourDow, cyIsWeekend } from "./cy-time";

export const HEADWAY_MIN_SAMPLES = 5;
export const HEADWAY_WEAK_SAMPLES = 3;
export const HEADWAY_MIN_SEC = 3 * 60;
export const HEADWAY_MAX_SEC = 90 * 60;
export const LAST_SEEN_MIN_SEC = 90;
export const LAST_SEEN_MAX_SEC = 90 * 60;
export const CHANCE_FLOOR_PCT = 15;
export const CHANCE_CEIL_PCT = 90;

export type HeadwayObs = {
  routeId: string;
  stopId: string;
  hour: number;
  dow: number;
  observedSec: number;
  scheduledSec: number;
  samples: number;
};

export type HeadwayWhen =
  | "weekdayMorning"
  | "weekdayAfternoon"
  | "weekdayEvening"
  | "weekdayNight"
  | "weekendMorning"
  | "weekendAfternoon"
  | "weekendEvening"
  | "weekendNight";

export type HeadwaySource = "observed" | "scheduled";

export type HeadwayHint = {
  meanMin: number;
  source: HeadwaySource;
  when: HeadwayWhen;
  lastSeenMin: number | null;
  chancePct: number | null;
  beforeUnix: number;
};

export type HeadwayDeparture = {
  tripId: string;
  routeId: string;
  arrivalUnix: number;
  tier: "live" | "rider-confirmed" | "predicted" | "ghost" | "scheduled";
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function medianGapSec(timesUnix: number[]): number | null {
  if (timesUnix.length < 2) return null;
  const times = [...timesUnix].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i]! - times[i - 1]!;
    if (g >= 60 && g <= 3 * 3600) gaps.push(g);
  }
  return median(gaps);
}

export function scheduledGapAtStop(
  arrivals: { stopId: string; routeId: string; arrivalUnix: number }[],
  stopId: string,
  routeId: string,
): number | null {
  const times = arrivals
    .filter((a) => a.stopId === stopId && a.routeId === routeId)
    .map((a) => a.arrivalUnix);
  return medianGapSec(times);
}

export function lastSeenAgeSec(
  vehicles: { routeId: string; timestamp: number }[],
  routeId: string,
  nowSec: number,
): number | null {
  let latest = 0;
  for (const v of vehicles) {
    if (v.routeId !== routeId) continue;
    if (v.timestamp > latest) latest = v.timestamp;
  }
  if (latest <= 0) return null;
  const age = nowSec - latest;
  if (age < LAST_SEEN_MIN_SEC || age > LAST_SEEN_MAX_SEC) return null;
  return age;
}

export function headwayWhen(hour: number, weekend: boolean): HeadwayWhen {
  const period =
    hour >= 5 && hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
  return `${weekend ? "weekend" : "weekday"}${period}` as HeadwayWhen;
}

function inRange(sec: number): boolean {
  return sec >= HEADWAY_MIN_SEC && sec <= HEADWAY_MAX_SEC;
}

export function pickHeadwayMean(
  obs: HeadwayObs | undefined,
  scheduledGapSec: number | null,
): { meanSec: number; source: HeadwaySource } | null {
  if (obs && obs.samples >= HEADWAY_MIN_SAMPLES && inRange(obs.observedSec)) {
    return { meanSec: obs.observedSec, source: "observed" };
  }
  if (scheduledGapSec != null && inRange(scheduledGapSec)) {
    return { meanSec: scheduledGapSec, source: "scheduled" };
  }
  if (obs && obs.samples >= HEADWAY_WEAK_SAMPLES && inRange(obs.observedSec)) {
    return { meanSec: obs.observedSec, source: "observed" };
  }
  if (obs && inRange(obs.scheduledSec)) {
    return { meanSec: obs.scheduledSec, source: "scheduled" };
  }
  return null;
}

export function matchHeadwayObs(
  obs: HeadwayObs[],
  routeId: string,
  stopId: string,
  nowMs: number,
): HeadwayObs | undefined {
  const { hour, dow } = cyHourDow(nowMs);
  return obs.find(
    (o) => o.routeId === routeId && o.stopId === stopId && o.hour === hour && o.dow === dow,
  );
}

/**
 * P(wait ≤ horizon | typical headway μ, optional seconds since last seen).
 * Memoryless exponential, with remaining wait = μ − age when the last bus
 * was recent, and a decay when it is overdue (the pattern may have stopped).
 */
export function survivalChance(
  horizonSec: number,
  meanSec: number,
  lastSeenAgeSec: number | null,
): number {
  const t = Math.max(0, horizonSec);
  const mu = Math.max(1, meanSec);
  let remaining = mu;
  if (lastSeenAgeSec != null && lastSeenAgeSec >= 0 && lastSeenAgeSec < mu) {
    remaining = Math.max(60, mu - lastSeenAgeSec);
  }
  let p = 1 - Math.exp(-t / remaining);
  if (lastSeenAgeSec != null && lastSeenAgeSec > mu) {
    p *= Math.exp(-(lastSeenAgeSec - mu) / (2 * mu));
  }
  return p;
}

export function chancePercent(p: number): number | null {
  const pct = Math.round(p * 20) * 5;
  if (pct < CHANCE_FLOOR_PCT) return null;
  return Math.min(CHANCE_CEIL_PCT, pct);
}

function horizonSec(arrivalUnix: number, nowSec: number, meanSec: number): number {
  const until = arrivalUnix - nowSec;
  const raw = until >= 3 * 60 && until <= 30 * 60 ? until : meanSec;
  return Math.min(30 * 60, Math.max(3 * 60, raw));
}

export function pickHeadwayHint(input: {
  obs: HeadwayObs | undefined;
  scheduledGapSec: number | null;
  lastSeenAgeSec: number | null;
  arrivalUnix: number;
  nowSec: number;
}): HeadwayHint | null {
  const picked = pickHeadwayMean(input.obs, input.scheduledGapSec);
  if (!picked) return null;
  const h = horizonSec(input.arrivalUnix, input.nowSec, picked.meanSec);
  const p = survivalChance(h, picked.meanSec, input.lastSeenAgeSec);
  const nowMs = input.nowSec * 1000;
  const { hour } = cyHourDow(nowMs);
  const lastSeenMin =
    input.lastSeenAgeSec == null ? null : Math.max(1, Math.round(input.lastSeenAgeSec / 60));
  return {
    meanMin: Math.max(3, Math.round(picked.meanSec / 60)),
    source: picked.source,
    when: headwayWhen(hour, cyIsWeekend(nowMs)),
    lastSeenMin,
    chancePct: chancePercent(p),
    beforeUnix: input.nowSec + h,
  };
}

const DARK_TIERS = new Set<HeadwayDeparture["tier"]>(["ghost", "scheduled"]);

/** One route at one stop. Same numbers the stop card uses for that row. */
export function headwayHintForRoute(input: {
  obs: HeadwayObs[];
  vehicles: { routeId: string; timestamp: number }[];
  arrivals: { stopId: string; routeId: string; arrivalUnix: number }[];
  routeId: string;
  stopId: string;
  arrivalUnix: number;
  nowSec: number;
}): HeadwayHint | null {
  return pickHeadwayHint({
    obs: matchHeadwayObs(input.obs, input.routeId, input.stopId, input.nowSec * 1000),
    scheduledGapSec: scheduledGapAtStop(input.arrivals, input.stopId, input.routeId),
    lastSeenAgeSec: lastSeenAgeSec(input.vehicles, input.routeId, input.nowSec),
    arrivalUnix: input.arrivalUnix,
    nowSec: input.nowSec,
  });
}

/** First dark row per route at this stop. Live rows already have an ETA. */
export function pickHeadwayForDepartures(
  deps: HeadwayDeparture[],
  obs: HeadwayObs[],
  vehicles: { routeId: string; timestamp: number }[],
  arrivals: { stopId: string; routeId: string; arrivalUnix: number }[],
  stopId: string,
  nowSec: number,
): Map<string, HeadwayHint> {
  const out = new Map<string, HeadwayHint>();
  const spoken = new Set<string>();
  for (const d of deps) {
    if (!DARK_TIERS.has(d.tier) || spoken.has(d.routeId)) continue;
    const hint = headwayHintForRoute({
      obs,
      vehicles,
      arrivals,
      routeId: d.routeId,
      stopId,
      arrivalUnix: d.arrivalUnix,
      nowSec,
    });
    if (!hint) continue;
    out.set(d.tripId, hint);
    spoken.add(d.routeId);
  }
  return out;
}
