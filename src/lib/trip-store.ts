// Local-first storage for the Trip Companion, saved places and recent
// destinations. No auth yet — everything lives in the browser. Migration to
// Supabase per-user storage will be additive.

import { useCallback, useEffect, useState } from "react";
import type { JourneyOption } from "./journey.server";
import type { Itinerary, RideLeg, WalkLeg } from "./itinerary-types";
import { distanceM, WALK_M_PER_S } from "./geo";

const ACTIVE_KEY = "aloya:active-trip";
const SAVED_KEY = "aloya:saved-places";
const RECENT_KEY = "aloya:recent-destinations";

export type SavedPlace = {
  id: string;
  label: string; // "Home", "Office", "Beach" — user-chosen
  name: string; // resolved address
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
  // Manual override: rider tapped "I'm on board" (or auto-confirmed).
  onBoardConfirmedAt?: number;
  // Manual override: rider tapped "Missed the bus".
  missedAt?: number;
  // Manual override: rider tapped "I'm off" (alighted).
  alightedAt?: number;
};

/** Per-leg live state for multi-leg trips. Indexed by leg position in
 *  `itinerary.legs` (NOT just ride legs — walk + wait count toward index). */
export type LegLiveState = {
  enteredAt?: number;          // when phase machine moved into this leg
  onBoardConfirmedAt?: number; // ride legs only
  alightedAt?: number;         // ride legs only
  missedAt?: number;           // ride legs only
  arrivedAt?: number;          // final egress walk — rider tapped "I'm here"
  completedAt?: number;        // any leg, when machine advanced past it
};


export type MultiLegState = {
  /** Index into itinerary.legs (0..N-1). */
  currentLegIndex: number;
  /** Per-leg manual confirmations + timestamps. */
  perLeg: Record<number, LegLiveState>;
};

export type ActiveTrip = {
  startedAt: number;
  option: JourneyOption;
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  live?: LiveTripState;
  /** Full multi-leg itinerary. Present for every trip started after Phase 4,
   *  including single-ride ones (1 ride leg + walks). The legacy `option`
   *  field is still populated for single-ride trips so the existing journey
   *  hook keeps working unchanged. */
  itinerary?: Itinerary;
  /** Multi-leg phase state. Only present (and only used) when itinerary has
   *  ≥ 2 ride legs. */
  legState?: MultiLegState;
};

// ---------- raw helpers ----------
function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T | null) {
  if (typeof window === "undefined") return;
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("aloya:store", { detail: { key } }));
}

// ---------- active trip ----------
// Auto-expire windows: if the rider stops interacting after the trip
// "should" be done, we don't want the next session reopening a ghost trip.
const MAX_TRIP_AGE_MS = 6 * 60 * 60 * 1000;          // 6h hard cap from start
const ARRIVAL_GRACE_MS = 2 * 60 * 60 * 1000;          // 2h after expected arrival

export function setActiveTrip(trip: ActiveTrip) {
  write(ACTIVE_KEY, trip);
  // Mirror to the server so background push alerts can be scheduled even
  // when the tab is hidden or the app is closed. Fire-and-forget: this
  // must never block the UI start-trip flow.
  void syncActiveTripToServer(trip).catch((e) =>
    console.warn("[trip-store] server sync failed", e),
  );
}
export function clearActiveTrip() {
  write<null>(ACTIVE_KEY, null);
  void clearActiveTripOnServer().catch(() => {});
}
export function getActiveTrip(): ActiveTrip | null {
  const t = read<ActiveTrip>(ACTIVE_KEY);
  if (!t) return null;
  // Hygiene: drop stale trips so the companion never resurrects a journey
  // that should already be done. Bounded by both the absolute trip age and
  // the expected arrival time (when known).
  const now = Date.now();
  const ageMs = t.startedAt ? now - t.startedAt : 0;
  const legacyArrivalUnix =
    (t.option?.legs?.[t.option.legs.length - 1] as { arrivalUnix?: number } | undefined)
      ?.arrivalUnix ?? 0;
  const expectedArrivalMs =
    ((t.itinerary?.arrivalUnix ?? 0) * 1000) ||
    legacyArrivalUnix * 1000;
  const pastArrival =
    expectedArrivalMs > 0 && now - expectedArrivalMs > ARRIVAL_GRACE_MS;
  if (ageMs > MAX_TRIP_AGE_MS || pastArrival) {
    write<null>(ACTIVE_KEY, null);
    void clearActiveTripOnServer().catch(() => {});
    return null;
  }
  return t;
}

async function syncActiveTripToServer(trip: ActiveTrip) {
  if (typeof window === "undefined") return;
  const { upsertActiveTrip } = await import("./trip-sync.functions");
  const { getDeviceId } = await import("./pwa");
  const bus = trip.option.legs.find((l) => l.kind === "bus");
  const walkIn = trip.option.legs[0];
  const walkOut = trip.option.legs[trip.option.legs.length - 1];
  if (!bus || bus.kind !== "bus") return;
  await upsertActiveTrip({
    data: {
      deviceId: getDeviceId(),
      tripId: trip.option.id,
      routeShort: bus.routeShort,
      boardStopId: bus.board.stopId,
      boardName: bus.board.name,
      boardUnix: bus.board.departureUnix,
      alightStopId: bus.alight.stopId,
      alightName: bus.alight.name,
      alightUnix: bus.alight.arrivalUnix,
      walkInSec: walkIn?.kind === "walk" ? walkIn.durationSec : 0,
      walkOutSec: walkOut?.kind === "walk" ? walkOut.durationSec : 0,
      // Multi-leg payload: serialize the full itinerary so the background
      // cron can fire per-leg alerts (alight from leg 0, board leg 1, etc.).
      // Single-leg trips include this too — the cron will treat them as a
      // 1-ride itinerary, which produces the same alerts as the legacy path.
      itineraryId: trip.itinerary?.id,
      totalArrivalUnix: trip.itinerary?.arrivalUnix,
      legs: trip.itinerary?.legs,
    },
  });
}

async function clearActiveTripOnServer() {
  if (typeof window === "undefined") return;
  const { removeActiveTrip } = await import("./trip-sync.functions");
  const { getDeviceId } = await import("./pwa");
  await removeActiveTrip({ data: { deviceId: getDeviceId() } });
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

/** Returns the ride legs in order. Walk + wait legs are excluded. */
export function rideLegsOf(it: Itinerary): RideLeg[] {
  return it.legs.filter((l): l is RideLeg => l.kind === "ride");
}

/** True when an itinerary needs the multi-leg companion experience. */
export function isMultiLeg(it: Itinerary | undefined): boolean {
  if (!it) return false;
  return rideLegsOf(it).length >= 2;
}

/** Initialise multi-leg state for a freshly started trip. Starts at leg 0
 *  (typically the access walk). */
export function initialLegState(): MultiLegState {
  return {
    currentLegIndex: 0,
    perLeg: { 0: { enteredAt: Date.now() } },
  };
}

/** Patch the per-leg state for the *current* leg. */
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

/** Advance the phase machine to the next leg. Marks the current leg as
 *  completed and stamps `enteredAt` on the new leg. Idempotent at end. */
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

/** Collapse all remaining legs (from current leg onward) into a single
 *  walk leg from the rider's current GPS to the destination. Used by the
 *  shortcut detector — when the rider is already near the destination,
 *  there's no point waiting for another bus. */
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
  return read<SavedPlace[]>(SAVED_KEY) ?? [];
}
export function upsertSavedPlace(p: SavedPlace) {
  const all = listSavedPlaces().filter((x) => x.id !== p.id);
  all.push(p);
  write(SAVED_KEY, all);
}
export function removeSavedPlace(id: string) {
  write(SAVED_KEY, listSavedPlaces().filter((p) => p.id !== id));
}

// ---------- recents ----------
export function listRecents(): RecentDestination[] {
  return (read<RecentDestination[]>(RECENT_KEY) ?? []).sort(
    (a, b) => b.lastUsed - a.lastUsed,
  );
}
export function pushRecent(r: Omit<RecentDestination, "id" | "lastUsed"> & { id?: string }) {
  const id = r.id ?? `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;
  const all = listRecents().filter((x) => x.id !== id);
  all.unshift({ id, name: r.name, lat: r.lat, lng: r.lng, lastUsed: Date.now() });
  write(RECENT_KEY, all.slice(0, 12));
}

// ---------- reactive hook ----------
export function useStoreValue<T>(key: string, getter: () => T): T {
  const [value, setValue] = useState<T>(getter);
  const refresh = useCallback(() => setValue(getter()), [getter]);
  useEffect(() => {
    refresh();
    const onStore = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail || detail.key === key) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === key) refresh();
    };
    window.addEventListener("aloya:store", onStore);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("aloya:store", onStore);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, refresh]);
  return value;
}

export const useActiveTrip = () => useStoreValue(ACTIVE_KEY, getActiveTrip);
export const useSavedPlaces = () => useStoreValue(SAVED_KEY, listSavedPlaces);
export const useRecents = () => useStoreValue(RECENT_KEY, listRecents);
