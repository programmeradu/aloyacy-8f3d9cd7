// Group trips — multi-rider "watch" surface using the anon-safe public
// server functions (createTripGroup / pingGroupMember / leaveTripGroup)
// via /api/public/trip-groups. No account required to host or join.

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";
import { supabase } from "./supabase";
import type { ActiveTrip } from "./trip-store";

const PING_INTERVAL_MS = 20_000;
const PUBLIC_BASE = "https://app.aloya.cy";
const STORAGE_KEY = "aloya.groupTrip.v2";

export type GroupTripSession = {
  code: string;
  memberToken: string;
  displayName: string;
  url: string;
  destinationLabel: string;
};

async function callGroups<T>(action: "create" | "join" | "ping" | "leave", payload: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/api/public/trip-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const cache = new Map<string, GroupTripSession>();

async function loadCached(): Promise<GroupTripSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GroupTripSession;
  } catch {
    return null;
  }
}
async function saveCached(s: GroupTripSession | null) {
  try {
    if (!s) await AsyncStorage.removeItem(STORAGE_KEY);
    else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

export function useGroupTrip(opts: {
  active: ActiveTrip;
  fix: { lat: number; lng: number } | null;
  etaMinutes: number | null;
  displayName?: string;
}) {
  const { active, fix, displayName } = opts;
  const key = `${active.startedAt}:${active.to.label}`;
  const [session, setSession] = useState<GroupTripSession | null>(() => cache.get(key) ?? null);
  const [busy, setBusy] = useState(false);
  const lastPingRef = useRef(0);

  useEffect(() => {
    if (session) return;
    let cancelled = false;
    void loadCached().then((s) => {
      if (cancelled) return;
      if (s && s.destinationLabel === active.to.label) {
        cache.set(key, s);
        setSession(s);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [key, active.to.label, session]);

  const create = useCallback(async (): Promise<GroupTripSession | null> => {
    if (busy) return null;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const name = displayName?.trim() || user?.user_metadata?.full_name || "You";

      const res = await callGroups<{ code: string; memberToken: string }>("create", {
        destinationLabel: active.to.label,
        destination: { lat: active.to.lat, lng: active.to.lng },
        hostName: name,
        originLabel: active.from.label,
        origin: fix ? { lat: fix.lat, lng: fix.lng } : undefined,
        expiresInHours: 6,
      });
      if (!res) return null;

      const next: GroupTripSession = {
        code: res.code,
        memberToken: res.memberToken,
        displayName: name,
        url: `${PUBLIC_BASE}/group/${res.code}`,
        destinationLabel: active.to.label,
      };
      cache.set(key, next);
      await saveCached(next);
      setSession(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [busy, active, fix, displayName, key]);

  const leave = useCallback(async () => {
    if (!session) return;
    await callGroups("leave", { memberToken: session.memberToken });
    cache.delete(key);
    await saveCached(null);
    setSession(null);
  }, [session, key]);

  // Ping own position + let the server recompute the transit ETA.
  useEffect(() => {
    if (!session || !fix) return;
    const now = Date.now();
    if (now - lastPingRef.current < PING_INTERVAL_MS) return;
    lastPingRef.current = now;
    void callGroups("ping", {
      memberToken: session.memberToken,
      position: { lat: fix.lat, lng: fix.lng },
    });
  }, [session, fix]);

  return { session, create, leave, busy };
}
