// Wave 2.6 · Trip chaining.
//
// Locally logs completed trips (from → to + when) as the rider finishes
// each Companion session, then surfaces a "return trip" suggestion when
// the rider is back near a place they've recently arrived at. The idea:
// after commuting Nicosia → Larnaca at 09:00, the app should quietly
// offer Larnaca → Nicosia around 18:00 without any planning taps.
//
// All state is on-device (AsyncStorage). This complements the cloud
// `trip_history` used by the web planner but doesn't require a network
// round-trip on the home screen — chained suggestions are instant.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { distanceM } from "@aloya/core/geo";
import type { ActiveTrip } from "./trip-store";

const KEY = "aloya:trip-chain-log";
const MAX_ENTRIES = 25;
const NEAR_ORIGIN_M = 400; // rider is "at" the previous destination
const RETURN_WINDOW_H = 14; // window we still consider a return trip
const HOUR_MATCH_TOLERANCE = 3;

export type ChainEntry = {
  id: string;
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  completedAt: number; // ms
  hour: number; // local hour of completion (0-23)
};

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: ChainEntry[] | null = null;
let hydration: Promise<ChainEntry[]> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

async function hydrate(): Promise<ChainEntry[]> {
  if (cache) return cache;
  if (!hydration) {
    hydration = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        cache = raw ? (JSON.parse(raw) as ChainEntry[]) : [];
      } catch {
        cache = [];
      }
      return cache;
    })();
  }
  return hydration;
}

async function persist(next: ChainEntry[]) {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // non-fatal — memory copy remains authoritative for this session
  }
  emit();
}

function tripWasCompleted(t: ActiveTrip): boolean {
  if (!t) return false;
  if (t.live?.alightedAt) return true;
  const legs = t.legState?.perLeg;
  if (!legs) return false;
  return Object.values(legs).some(
    (l) => l && (l.alightedAt || l.arrivedAt || l.completedAt),
  );
}

// Called when a Companion trip is torn down. Silent when the trip
// clearly didn't complete (aborted, expired, missed) so we don't
// suggest a return leg the rider never made.
export async function logCompletedTrip(t: ActiveTrip | null | undefined) {
  if (!t || !tripWasCompleted(t)) return;
  if (!Number.isFinite(t.from?.lat) || !Number.isFinite(t.to?.lat)) return;
  const now = new Date();
  const entry: ChainEntry = {
    id: `${t.startedAt}-${t.to.lat.toFixed(3)},${t.to.lng.toFixed(3)}`,
    from: { lat: t.from.lat, lng: t.from.lng, label: t.from.label },
    to: { lat: t.to.lat, lng: t.to.lng, label: t.to.label },
    completedAt: Date.now(),
    hour: now.getHours(),
  };
  const existing = await hydrate();
  const deduped = existing.filter((e) => e.id !== entry.id);
  const next = [entry, ...deduped].slice(0, MAX_ENTRIES);
  await persist(next);
}

export type ReturnSuggestion = {
  from: ChainEntry["to"]; // return trip starts where they arrived
  to: ChainEntry["from"]; // and ends where they came from
  basedOn: ChainEntry;
  reason: string;
  usualReturnTime: string | null;
};

// Given the rider's current location and the current wall-clock hour,
// find the best "you probably want to head back" suggestion.
export function pickReturnSuggestion(
  entries: ChainEntry[],
  here: { lat: number; lng: number } | null,
  now: Date = new Date(),
): ReturnSuggestion | null {
  if (!entries.length || !here) return null;
  const nowMs = now.getTime();
  const nowHour = now.getHours();

  // Candidates: trips whose destination is near "here" and completed
  // within the return window (so we don't suggest returning home hours
  // after we already did).
  const cand = entries
    .map((e) => {
      const distToOrigin = distanceM(here, { lat: e.to.lat, lng: e.to.lng });
      const distFromReturn = distanceM(here, { lat: e.from.lat, lng: e.from.lng });
      const hoursSince = (nowMs - e.completedAt) / 3_600_000;
      return { e, distToOrigin, distFromReturn, hoursSince };
    })
    .filter(
      (c) =>
        c.distToOrigin <= NEAR_ORIGIN_M &&
        c.distFromReturn > NEAR_ORIGIN_M && // don't suggest going where we already are
        c.hoursSince <= RETURN_WINDOW_H &&
        c.hoursSince >= 0.25,
    );
  if (!cand.length) return null;

  // Score: recency (this-session > yesterday) + hour proximity to a
  // typical return hour derived from past chain entries with the same
  // destination.
  type Scored = (typeof cand)[number] & {
    score: number;
    typicalReturnHour: number | null;
  };
  const scored: Scored[] = cand.map((c) => {
    const recency = Math.max(0, 1 - c.hoursSince / RETURN_WINDOW_H);
    // Estimate typical return hour = median completion hour of previous
    // trips that go the OPPOSITE direction (from ~= c.e.to → to ~= c.e.from).
    const opposites = entries.filter(
      (o) =>
        distanceM(o.from, c.e.to) <= NEAR_ORIGIN_M &&
        distanceM(o.to, c.e.from) <= NEAR_ORIGIN_M,
    );
    const hours = opposites.map((o) => o.hour).sort((a, b) => a - b);
    const typicalReturnHour = hours.length
      ? hours[Math.floor(hours.length / 2)]
      : null;
    const hourDelta =
      typicalReturnHour == null
        ? 0
        : Math.min(
            Math.abs(typicalReturnHour - nowHour),
            24 - Math.abs(typicalReturnHour - nowHour),
          );
    const hourMatch =
      typicalReturnHour == null
        ? 0.4 // no history yet: mild boost, still allowed
        : hourDelta <= HOUR_MATCH_TOLERANCE
          ? 1 - hourDelta / (HOUR_MATCH_TOLERANCE + 1)
          : 0;
    return {
      ...c,
      typicalReturnHour,
      score: recency * 2 + hourMatch * 3 + opposites.length * 0.5,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.6) return null;

  let reason: string;
  if (best.typicalReturnHour != null && best.score >= 2) {
    reason = "You usually head back around now";
  } else if (best.hoursSince < 4) {
    reason = "Return the way you came?";
  } else {
    reason = "Back to your origin?";
  }
  const usualReturnTime =
    best.typicalReturnHour != null
      ? `${String(best.typicalReturnHour).padStart(2, "0")}:00`
      : null;

  return {
    from: best.e.to,
    to: best.e.from,
    basedOn: best.e,
    reason,
    usualReturnTime,
  };
}

// ---- reactive hooks ----
function useEntries(): ChainEntry[] {
  const [value, setValue] = useState<ChainEntry[]>(cache ?? []);
  const refresh = useCallback(() => setValue(cache ? [...cache] : []), []);
  useEffect(() => {
    let alive = true;
    void hydrate().then(() => {
      if (alive) refresh();
    });
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, [refresh]);
  return value;
}

export function useReturnSuggestion(
  here: { lat: number; lng: number } | null,
): ReturnSuggestion | null {
  const entries = useEntries();
  const [tick, setTick] = useState(0);
  // Re-evaluate every 5 min so the "usually around now" check stays fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  return pickReturnSuggestion(entries, here, new Date(Date.now() + tick * 0));
}

export async function clearTripChainLog() {
  await persist([]);
}
