// Share-my-ETA — creates a signed link that friends open on the web to
// watch a rider's live position + ETA to their destination. The token is
// the capability (unguessable UUID) — anyone with it can read, only the
// owner (or the originating anon device) can update.

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE } from "./api";
import type { ActiveTrip } from "./trip-store";

const PING_INTERVAL_MS = 20_000;
const PUBLIC_BASE = "https://app.aloya.cy";

export type ShareEtaSession = {
  token: string;
  url: string;
  createdAt: number;
  /** Capability for ping/end; only this device holds it. */
  writeKey: string;
};

async function postShare(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${API_BASE}/api/public/eta-share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
      const res = await postShare({
        action: "create",
        originLabel: active.from.label,
        destinationLabel: active.to.label,
        destinationLat: active.to.lat,
        destinationLng: active.to.lng,
        lastLat: fix?.lat ?? null,
        lastLng: fix?.lng ?? null,
        etaMinutes,
      }).catch(() => null);
      if (!res?.ok) {
        console.warn("[shareEta] create failed", res?.status);
        return null;
      }
      const created = (await res.json()) as { token: string; url: string; writeKey: string };
      const next: ShareEtaSession = {
        token: created.token,
        url: created.url || `${PUBLIC_BASE}/eta/${created.token}`,
        createdAt: Date.now(),
        writeKey: created.writeKey,
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
    await postShare({ action: "end", token: session.token, writeKey: session.writeKey }).catch(() => null);
    memoryCache.delete(keyFor(active));
    setSession(null);
  }, [session, active]);

  // Push periodic pings while a share is active.
  useEffect(() => {
    if (!session || !fix) return;
    const now = Date.now();
    if (now - lastPingRef.current < PING_INTERVAL_MS) return;
    lastPingRef.current = now;
    void postShare({
      action: "ping",
      token: session.token,
      writeKey: session.writeKey,
      lastLat: fix.lat,
      lastLng: fix.lng,
      etaMinutes,
    }).catch(() => null);
  }, [session, fix, etaMinutes]);

  return { session, create, stop, creating };
}
