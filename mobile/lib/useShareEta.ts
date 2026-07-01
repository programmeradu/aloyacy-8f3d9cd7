// Share-my-ETA — creates a signed link that friends open on the web to
// watch a rider's live position + ETA to their destination. The token is
// the capability (unguessable UUID) — anyone with it can read, only the
// owner (or the originating anon device) can update.

import { useCallback, useEffect, useRef, useState } from "react";

function randomToken(): string {
  // 128-bit token, base36 — good enough as an unguessable capability.
  const a = Math.floor(Math.random() * 0xffffffff).toString(36);
  const b = Math.floor(Math.random() * 0xffffffff).toString(36);
  const c = Math.floor(Math.random() * 0xffffffff).toString(36);
  const d = Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${a}${b}${c}${d}${Date.now().toString(36)}`;
}
import { supabase } from "./supabase";
import type { ActiveTrip } from "./trip-store";

const PING_INTERVAL_MS = 20_000;
const PUBLIC_BASE = "https://app.aloya.cy";

export type ShareEtaSession = {
  token: string;
  url: string;
  createdAt: number;
};

const STORAGE_PREFIX = "aloya.shareEta.v1:";
const memoryCache = new Map<string, ShareEtaSession>();

function keyFor(trip: ActiveTrip) {
  return `${trip.from.label}→${trip.to.label}@${Math.floor(trip.startedAt / 60000)}`;
}

export function useShareEta(opts: {
  active: ActiveTrip;
  fix: { lat: number; lng: number } | null;
  etaMinutes: number | null;
}) {
  const { active, fix, etaMinutes } = opts;
  const [session, setSession] = useState<ShareEtaSession | null>(
    () => memoryCache.get(keyFor(active)) ?? null,
  );
  const [creating, setCreating] = useState(false);
  const lastPingRef = useRef(0);

  const create = useCallback(async (): Promise<ShareEtaSession | null> => {
    if (creating) return null;
    setCreating(true);
    try {
      const token = Crypto.randomUUID().replace(/-/g, "");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("shared_trips").insert({
        token,
        owner_id: user?.id ?? null,
        origin_label: active.from.label,
        destination_label: active.to.label,
        destination_lat: active.to.lat,
        destination_lng: active.to.lng,
        last_lat: fix?.lat ?? null,
        last_lng: fix?.lng ?? null,
        last_updated: fix ? new Date().toISOString() : null,
        eta_minutes: etaMinutes,
        status: "active",
      });
      if (error) {
        console.warn("[shareEta] insert failed", error);
        return null;
      }
      const next: ShareEtaSession = {
        token,
        url: `${PUBLIC_BASE}/eta/${token}`,
        createdAt: Date.now(),
      };
      memoryCache.set(keyFor(active), next);
      setSession(next);
      return next;
    } finally {
      setCreating(false);
    }
  }, [active, fix, etaMinutes, creating]);

  const stop = useCallback(async () => {
    if (!session) return;
    await supabase
      .from("shared_trips")
      .update({ status: "ended", last_updated: new Date().toISOString() })
      .eq("token", session.token);
    memoryCache.delete(keyFor(active));
    setSession(null);
  }, [session, active]);

  // Push periodic pings while a share is active.
  useEffect(() => {
    if (!session || !fix) return;
    const now = Date.now();
    if (now - lastPingRef.current < PING_INTERVAL_MS) return;
    lastPingRef.current = now;
    void supabase
      .from("shared_trips")
      .update({
        last_lat: fix.lat,
        last_lng: fix.lng,
        last_updated: new Date().toISOString(),
        eta_minutes: etaMinutes,
      })
      .eq("token", session.token);
  }, [session, fix, etaMinutes]);

  return { session, create, stop, creating };
}
