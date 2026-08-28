// C2 disagreement. When a rider GPS and the operator feed contradict,
// the gap is a sample — unsigned metres, inferred seconds at 8 m/s.
// We do not call the operator optimistic: distance has no sign.
// Pure — no clock, no I/O.

import { distanceM, type LatLng } from "./geo";
import { cyHourDow } from "./cy-time";

export const FEED_DELTA_MAX_GAP_SEC = 20;
export const FEED_MPS = 8;
export const FEED_DELTA_MIN_M = 40;
export const FEED_SPEAK_MIN_N = 8;
export const FEED_SPEAK_MIN_SEC = 120;

export type FeedPing = {
  tripId: string;
  routeId: string;
  lat: number;
  lng: number;
  tMs: number;
};

export type RiderFix = {
  tripId: string;
  lat: number;
  lng: number;
  tMs: number;
};

export type FeedDeltaPair = {
  tripId: string;
  routeId: string;
  tMs: number;
  deltaM: number;
  deltaSec: number;
};

export type FeedDeltaBucket = {
  routeId: string;
  hour: number;
  dow: number;
  meanDeltaM: number;
  meanDeltaSec: number;
  n: number;
};

export type FeedDeltaRow = FeedDeltaBucket;

export type FeedDeltaHint = {
  routeId: string;
  minutes: number;
  n: number;
};

export function pingDelta(a: LatLng, b: LatLng): { deltaM: number; deltaSec: number } {
  const deltaM = distanceM(a, b);
  return { deltaM, deltaSec: deltaM / FEED_MPS };
}

function pairOneTrip(tripId: string, feeds: FeedPing[], riders: RiderFix[]): FeedDeltaPair[] {
  const maxGapMs = FEED_DELTA_MAX_GAP_SEC * 1000;
  const cands: Array<{ fi: number; ri: number; gap: number }> = [];
  for (let fi = 0; fi < feeds.length; fi++) {
    for (let ri = 0; ri < riders.length; ri++) {
      const gap = Math.abs(feeds[fi]!.tMs - riders[ri]!.tMs);
      if (gap > maxGapMs) continue;
      cands.push({ fi, ri, gap });
    }
  }
  cands.sort((a, b) => a.gap - b.gap);
  const usedF = new Set<number>();
  const usedR = new Set<number>();
  const out: FeedDeltaPair[] = [];
  for (const c of cands) {
    if (usedF.has(c.fi) || usedR.has(c.ri)) continue;
    usedF.add(c.fi);
    usedR.add(c.ri);
    const f = feeds[c.fi]!;
    const r = riders[c.ri]!;
    const { deltaM, deltaSec } = pingDelta(f, r);
    if (deltaM < FEED_DELTA_MIN_M) continue;
    const routeId = f.routeId;
    if (!routeId) continue;
    out.push({ tripId, routeId, tMs: r.tMs, deltaM, deltaSec });
  }
  return out;
}

export function pairFeedAndRider(feeds: FeedPing[], riders: RiderFix[]): FeedDeltaPair[] {
  const feedsByTrip = new Map<string, FeedPing[]>();
  for (const f of feeds) {
    if (!f.tripId) continue;
    const arr = feedsByTrip.get(f.tripId);
    if (arr) arr.push(f);
    else feedsByTrip.set(f.tripId, [f]);
  }
  const ridersByTrip = new Map<string, RiderFix[]>();
  for (const r of riders) {
    if (!r.tripId) continue;
    const arr = ridersByTrip.get(r.tripId);
    if (arr) arr.push(r);
    else ridersByTrip.set(r.tripId, [r]);
  }
  const out: FeedDeltaPair[] = [];
  for (const [tripId, tripFeeds] of feedsByTrip) {
    const tripRiders = ridersByTrip.get(tripId);
    if (!tripRiders) continue;
    out.push(...pairOneTrip(tripId, tripFeeds, tripRiders));
  }
  return out;
}

export function bucketPairs(pairs: FeedDeltaPair[]): FeedDeltaBucket[] {
  const by = new Map<
    string,
    { routeId: string; hour: number; dow: number; sumM: number; sumSec: number; n: number }
  >();
  for (const p of pairs) {
    if (!p.routeId) continue;
    const { hour, dow } = cyHourDow(p.tMs);
    const key = `${p.routeId}|${hour}|${dow}`;
    const slot = by.get(key) ?? {
      routeId: p.routeId,
      hour,
      dow,
      sumM: 0,
      sumSec: 0,
      n: 0,
    };
    slot.sumM += p.deltaM;
    slot.sumSec += p.deltaSec;
    slot.n += 1;
    by.set(key, slot);
  }
  return [...by.values()].map((s) => ({
    routeId: s.routeId,
    hour: s.hour,
    dow: s.dow,
    meanDeltaM: s.sumM / s.n,
    meanDeltaSec: s.sumSec / s.n,
    n: s.n,
  }));
}

export function shouldSpeakFeedDelta(n: number, meanDeltaSec: number): boolean {
  if (n < FEED_SPEAK_MIN_N) return false;
  if (Math.abs(meanDeltaSec) < FEED_SPEAK_MIN_SEC) return false;
  return true;
}

export function feedDeltaMinutes(meanDeltaSec: number): number {
  return Math.max(2, Math.round(Math.abs(meanDeltaSec) / 60));
}

export function pickFeedDeltaHints(rows: FeedDeltaRow[], nowMs: number): FeedDeltaHint[] {
  const { hour, dow } = cyHourDow(nowMs);
  const out: FeedDeltaHint[] = [];
  for (const row of rows) {
    if (row.hour !== hour || row.dow !== dow) continue;
    if (!shouldSpeakFeedDelta(row.n, row.meanDeltaSec)) continue;
    out.push({
      routeId: row.routeId,
      minutes: feedDeltaMinutes(row.meanDeltaSec),
      n: row.n,
    });
  }
  return out;
}

export function feedDeltaLine(routeShort: string, minutes: number): string {
  return `The official clock on Bus ${routeShort} is usually about ${minutes} min off this hour. We trust a rider on board.`;
}
