// One definition of "on time" for every Pulse surface (Network now card, Live
// network tiles, road pulse card) and for /api/public/pulse. Each of them reads
// one GTFS-RT snapshot through this function, so the page can never show two
// different on-time numbers again.
//
// Counted: buses with a live position matched to a trip that has left its first
// stop. A bus waiting at its terminus is predicted to "leave now" and reads as
// many minutes early, so it is not counted until it departs. Each bus counts
// once, by the feed's predicted delay at its next stop.
// On time: from 1 min early to 5 min late.
import type { RealtimeSnapshot } from "@/lib/gtfs-rt.server";

export const ON_TIME_EARLY_SEC = 60;
export const ON_TIME_LATE_SEC = 300;

export const CITY_KEYS = ["NPT", "LMS", "LCA", "PFO", "FAM", "IC"] as const;
export type CityKey = (typeof CITY_KEYS)[number];

export type CityNow = {
  key: CityKey;
  live: number;
  tracked: number;
  onTimePct: number | null;
  avgDelaySec: number;
};

export type NetworkNow = {
  fetchedAt: number;
  liveBuses: number;
  tracked: number;
  onTime: number;
  early: number;
  late: number;
  onTimePct: number;
  earlyPct: number;
  latePct: number;
  avgDelaySec: number;
  medianDelaySec: number;
  cities: CityNow[];
};

type Snap = Pick<RealtimeSnapshot, "fetchedAt" | "vehicles" | "arrivals">;

export type DelayClass = "early" | "onTime" | "late";

export function classifyDelay(sec: number): DelayClass {
  if (sec < -ON_TIME_EARLY_SEC) return "early";
  if (sec > ON_TIME_LATE_SEC) return "late";
  return "onTime";
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function computeNetworkNow(
  snap: Snap | null | undefined,
  agencyOf: (routeId: string) => string | undefined,
): NetworkNow {
  const now = snap?.fetchedAt || Math.floor(Date.now() / 1000);
  const liveTrips = new Map<string, string>();
  const liveByCity = new Map<string, number>();
  const seen = new Set<string>();
  for (const v of snap?.vehicles ?? []) {
    const key = v.tripId || v.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (v.tripId) liveTrips.set(v.tripId, v.routeId);
    const a = agencyOf(v.routeId);
    if (a) liveByCity.set(a, (liveByCity.get(a) ?? 0) + 1);
  }

  const next = new Map<string, { t: number; d: number; seq?: number }>();
  for (const a of snap?.arrivals ?? []) {
    if (!a.tripId || !liveTrips.has(a.tripId)) continue;
    if (!Number.isFinite(a.arrivalUnix) || a.arrivalUnix < now - 60) continue;
    const cur = next.get(a.tripId);
    if (!cur || a.arrivalUnix < cur.t) {
      next.set(a.tripId, { t: a.arrivalUnix, d: Number(a.delaySec) || 0, seq: a.seq });
    }
  }

  const delays: number[] = [];
  const byCity = new Map<string, number[]>();
  for (const [tripId, n] of next) {
    if (n.seq === 0) continue; // still at its first stop: not running yet
    delays.push(n.d);
    const a = agencyOf(liveTrips.get(tripId) ?? "");
    if (a) {
      const list = byCity.get(a) ?? [];
      list.push(n.d);
      byCity.set(a, list);
    }
  }

  let onTime = 0;
  let early = 0;
  let late = 0;
  let sum = 0;
  for (const d of delays) {
    const c = classifyDelay(d);
    if (c === "onTime") onTime++;
    else if (c === "early") early++;
    else late++;
    sum += d;
  }
  const n = delays.length;
  const sorted = [...delays].sort((a, b) => a - b);

  const cities: CityNow[] = CITY_KEYS.map((key) => {
    const list = byCity.get(key) ?? [];
    const ok = list.filter((d) => classifyDelay(d) === "onTime").length;
    return {
      key,
      live: liveByCity.get(key) ?? 0,
      tracked: list.length,
      onTimePct: list.length ? pct(ok, list.length) : null,
      avgDelaySec: list.length ? Math.round(list.reduce((s, d) => s + d, 0) / list.length) : 0,
    };
  });

  return {
    fetchedAt: now,
    liveBuses: seen.size,
    tracked: n,
    onTime,
    early,
    late,
    onTimePct: pct(onTime, n),
    earlyPct: pct(early, n),
    latePct: pct(late, n),
    avgDelaySec: n ? Math.round(sum / n) : 0,
    medianDelaySec: n ? Math.round(sorted[Math.floor(n / 2)]) : 0,
    cities,
  };
}
