// Local-first storage for the Trip Companion, saved places and recent
// destinations. No auth yet — everything lives in the browser. Migration to
// Supabase per-user storage will be additive.

import { useCallback, useEffect, useState } from "react";
import type { JourneyOption } from "./journey.server";

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

export type ActiveTrip = {
  startedAt: number;
  option: JourneyOption;
  from: { lat: number; lng: number; label: string };
  to: { lat: number; lng: number; label: string };
  live?: LiveTripState;
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
  return read<ActiveTrip>(ACTIVE_KEY);
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
