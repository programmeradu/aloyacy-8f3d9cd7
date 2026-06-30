// Local-first storage for the mobile Trip Companion, saved places, and
// recent destinations. Mirror of `src/lib/trip-store.ts` adapted to RN:
//
//   - persistence is AsyncStorage (web uses localStorage)
//   - reactive hooks subscribe to an in-process emitter (web listens for
//     `storage` + `aloya:store` events)
//   - server sync (push-alert mirror) is intentionally deferred to Wave C
//     so we don't ship a broken background channel; the local trip is
//     fully functional today.
//
// Public surface (`useActiveTrip`, `useSavedPlaces`, `useRecents`,
// `setActiveTrip`, `clearActiveTrip`, multi-leg helpers) matches web 1:1
// so the screens we port over can swap imports without restructuring.

import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { distanceM } from "@aloya/core/geo";
import { WALK_M_PER_S } from "@aloya/core/geo";
import type {
  Itinerary,
  JourneyOption,
  RideLeg,
  WalkLeg,
} from "./journey-types";

const ACTIVE_KEY = "aloya:active-trip";
const SAVED_KEY = "aloya:saved-places";
const RECENT_KEY = "aloya:recent-destinations";

export type SavedPlace = {
  id: string;
  label: string;
  name: string;
  lat: number;
  lng: number;
  tone: "aegean" | "ochre" | "olive";
  pinned: boolean;
  createdAt: number;
};

export type RecentDestination = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lastUsed: number;
};

export type LiveTripState = {
  startedAt: number;
  onBoardConfirmedAt?: number;
  missedAt?: number;
  alightedAt?: number;
};

export type LegLiveState = {
  enteredAt?: number;
  onBoardConfirmedAt?: number;
  alightedAt?: number;
  missedAt?: number;
  arrivedAt?: number;
  completedAt?: number;
};

export type MultiLegState = {
  currentLegIndex: number;
  perLeg: Record<number, LegLiveState>;
};

export type ActiveTrip = {
  startedAt: number;
  option: JourneyOption;
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  live?: LiveTripState;
  itinerary?: Itinerary;
  legState?: MultiLegState;
};

// ---------- in-memory cache + emitter ----------
type CacheShape = {
  [ACTIVE_KEY]: ActiveTrip | null;
  [SAVED_KEY]: SavedPlace[];
  [RECENT_KEY]: RecentDestination[];
};

const cache: CacheShape = {
  [ACTIVE_KEY]: null,
  [SAVED_KEY]: [],
  [RECENT_KEY]: [],
};

const listeners = new Map<string, Set<() => void>>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function subscribe(key: string, fn: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

async function readKey<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeKey<T>(key: string, value: T | null) {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage failures are non-fatal — the in-memory cache stays correct
    // and we'll retry on next write.
  }
}

export function hydrateTripStore(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const [active, saved, recents] = await Promise.all([
      readKey<ActiveTrip>(ACTIVE_KEY),
      readKey<SavedPlace[]>(SAVED_KEY),
      readKey<RecentDestination[]>(RECENT_KEY),
    ]);
    cache[ACTIVE_KEY] = pruneExpiredTrip(active);
    cache[SAVED_KEY] = saved ?? [];
    cache[RECENT_KEY] = (recents ?? []).sort((a, b) => b.lastUsed - a.lastUsed);
    hydrated = true;
    emit(ACTIVE_KEY);
    emit(SAVED_KEY);
    emit(RECENT_KEY);
  })();
  return hydrationPromise;
}

// ---------- active trip ----------
const MAX_TRIP_AGE_MS = 6 * 60 * 60 * 1000;
const ARRIVAL_GRACE_MS = 2 * 60 * 60 * 1000;

function pruneExpiredTrip(t: ActiveTrip | null): ActiveTrip | null {
  if (!t) return null;
  const now = Date.now();
  const ageMs = t.startedAt ? now - t.startedAt : 0;
  const legacyArrivalUnix =
    (t.option?.legs?.[t.option.legs.length - 1] as { arrivalUnix?: number } | undefined)
      ?.arrivalUnix ?? 0;
  const expectedArrivalMs =
    (t.itinerary?.arrivalUnix ?? 0) * 1000 || legacyArrivalUnix * 1000;
  const pastArrival =
    expectedArrivalMs > 0 && now - expectedArrivalMs > ARRIVAL_GRACE_MS;
  if (ageMs > MAX_TRIP_AGE_MS || pastArrival) {
    void writeKey<null>(ACTIVE_KEY, null);
    return null;
  }
  return t;
}

export function setActiveTrip(trip: ActiveTrip) {
  cache[ACTIVE_KEY] = trip;
  void writeKey(ACTIVE_KEY, trip);
  emit(ACTIVE_KEY);
}

export function clearActiveTrip() {
  cache[ACTIVE_KEY] = null;
  void writeKey<null>(ACTIVE_KEY, null);
  emit(ACTIVE_KEY);
}

export function getActiveTrip(): ActiveTrip | null {
  const pruned = pruneExpiredTrip(cache[ACTIVE_KEY]);
  if (pruned !== cache[ACTIVE_KEY]) {
    cache[ACTIVE_KEY] = pruned;
    emit(ACTIVE_KEY);
  }
  return cache[ACTIVE_KEY];
}

export function patchActiveTripLive(patch: Partial<LiveTripState>) {
  const cur = getActiveTrip();
  if (!cur) return;
  const live: LiveTripState = {
    startedAt: cur.live?.startedAt ?? Date.now(),
    ...cur.live,
    ...patch,
  };
  setActiveTrip({ ...cur, live });
}

// ---------- multi-leg helpers ----------
export function rideLegsOf(it: Itinerary): RideLeg[] {
  return it.legs.filter((l): l is RideLeg => l.kind === "ride");
}

export function isMultiLeg(it: Itinerary | undefined): boolean {
  if (!it) return false;
  return rideLegsOf(it).length >= 2;
}

export function initialLegState(): MultiLegState {
  return {
    currentLegIndex: 0,
    perLeg: { 0: { enteredAt: Date.now() } },
  };
}

export function patchCurrentLeg(patch: Partial<LegLiveState>) {
  const cur = getActiveTrip();
  if (!cur || !cur.legState) return;
  const idx = cur.legState.currentLegIndex;
  const next: MultiLegState = {
    ...cur.legState,
    perLeg: {
      ...cur.legState.perLeg,
      [idx]: { ...cur.legState.perLeg[idx], ...patch },
    },
  };
  setActiveTrip({ ...cur, legState: next });
}

export function advanceToNextLeg() {
  const cur = getActiveTrip();
  if (!cur || !cur.legState || !cur.itinerary) return;
  const total = cur.itinerary.legs.length;
  const idx = cur.legState.currentLegIndex;
  if (idx >= total - 1) return;
  const completed = { ...cur.legState.perLeg[idx], completedAt: Date.now() };
  const nextIdx = idx + 1;
  const next: MultiLegState = {
    currentLegIndex: nextIdx,
    perLeg: {
      ...cur.legState.perLeg,
      [idx]: completed,
      [nextIdx]: { ...cur.legState.perLeg[nextIdx], enteredAt: Date.now() },
    },
  };
  setActiveTrip({ ...cur, legState: next });
}

export function collapseToFinalWalk(fix: { lat: number; lng: number }) {
  const cur = getActiveTrip();
  if (!cur || !cur.itinerary || !cur.legState) return;
  const idx = cur.legState.currentLegIndex;
  const dest = cur.to;
  const meters = Math.round(distanceM(fix, { lat: dest.lat, lng: dest.lng }) * 1.35);
  const durationSec = Math.max(30, Math.round(meters / WALK_M_PER_S));
  const finalWalk: WalkLeg = {
    kind: "walk",
    from: { name: "Here", lat: fix.lat, lng: fix.lng },
    to: { name: dest.label, lat: dest.lat, lng: dest.lng },
    durationSec,
    distanceMeters: meters,
    verified: false,
  };
  const newLegs = [...cur.itinerary.legs.slice(0, idx), finalWalk];
  const now = Math.floor(Date.now() / 1000);
  const newItin: Itinerary = {
    ...cur.itinerary,
    legs: newLegs,
    arrivalUnix: now + durationSec,
    totalDurationSec: now + durationSec - Math.floor(cur.startedAt / 1000),
    totalWalkMeters: newLegs
      .filter((l): l is WalkLeg => l.kind === "walk")
      .reduce((a, w) => a + w.distanceMeters, 0),
  };
  const newLegState: MultiLegState = {
    currentLegIndex: idx,
    perLeg: { ...cur.legState.perLeg, [idx]: { enteredAt: Date.now() } },
  };
  setActiveTrip({ ...cur, itinerary: newItin, legState: newLegState });
}

// ---------- saved places ----------
export function listSavedPlaces(): SavedPlace[] {
  return cache[SAVED_KEY];
}

export function upsertSavedPlace(p: SavedPlace) {
  const all = listSavedPlaces().filter((x) => x.id !== p.id);
  all.push(p);
  cache[SAVED_KEY] = all;
  void writeKey(SAVED_KEY, all);
  emit(SAVED_KEY);
}

export function removeSavedPlace(id: string) {
  const next = listSavedPlaces().filter((p) => p.id !== id);
  cache[SAVED_KEY] = next;
  void writeKey(SAVED_KEY, next);
  emit(SAVED_KEY);
}

// ---------- recents ----------
export function listRecents(): RecentDestination[] {
  return cache[RECENT_KEY];
}

export function pushRecent(
  r: Omit<RecentDestination, "id" | "lastUsed"> & { id?: string },
) {
  const id = r.id ?? `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
  const all = listRecents().filter((x) => x.id !== id);
  all.unshift({ id, name: r.name, lat: r.lat, lng: r.lng, lastUsed: Date.now() });
  const next = all.slice(0, 12);
  cache[RECENT_KEY] = next;
  void writeKey(RECENT_KEY, next);
  emit(RECENT_KEY);
}

// ---------- reactive hooks ----------
function useStoreValue<T>(key: string, getter: () => T): T {
  const [value, setValue] = useState<T>(getter);
  const refresh = useCallback(() => setValue(getter()), [getter]);
  useEffect(() => {
    if (!hydrated) {
      void hydrateTripStore().then(refresh);
    } else {
      refresh();
    }
    return subscribe(key, refresh);
  }, [key, refresh]);
  return value;
}

export const useActiveTrip = () => useStoreValue(ACTIVE_KEY, getActiveTrip);
export const useSavedPlaces = () => useStoreValue(SAVED_KEY, listSavedPlaces);
export const useRecents = () => useStoreValue(RECENT_KEY, listRecents);
