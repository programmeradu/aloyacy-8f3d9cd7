// Native client for arrival promises. Talks to /api/public/arrival-promise
// with the rider's Supabase bearer token — same rows, same watcher, same
// nudges as the web app.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LadderRung, MarginPref, PromiseStatus } from "@aloya/core/arrival-promise";
import { fetchPublicApi } from "./api";
import { supabase } from "./supabase";
import { getOrCreateDeviceId } from "./push";

export type PromiseLeg =
  | {
      kind: "ride";
      routeId: string;
      routeShort: string;
      boardName: string;
      boardUnix: number;
      alightName: string;
      alightUnix: number;
      live: boolean;
    }
  | { kind: "walk"; durationSec: number; distanceMeters: number; toName: string }
  | { kind: "wait"; durationSec: number; name: string };

export type ArrivalPromise = {
  id: string;
  target_arrival_unix: number;
  margin_pref: MarginPref;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  plan_json: { legs?: PromiseLeg[]; departureUnix?: number } | null;
  ladder_json: LadderRung[] | null;
  leave_by_unix: number;
  baseline_leave_by_unix: number;
  buffer_sec: number;
  reason_short: string | null;
  status: PromiseStatus;
  last_replan_at: string | null;
  created_at: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to hold an arrival time.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function call<T>(init: RequestInit & { method: "GET" | "POST" }): Promise<T> {
  const res = await fetchPublicApi("/api/public/arrival-promise", {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers as Record<string, string>) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: unknown } & T;
  if (!res.ok) {
    const message =
      typeof body?.error === "string" ? body.error : "Could not reach the arrival watcher.";
    throw new Error(message);
  }
  return body;
}

export async function listPromises(): Promise<ArrivalPromise[]> {
  const body = await call<{ promises: ArrivalPromise[] }>({ method: "GET" });
  return body.promises ?? [];
}

export async function createPromise(args: {
  origin: { lat: number; lng: number; label: string };
  destination: { lat: number; lng: number; label: string };
  targetArrivalUnix: number;
  margin: MarginPref;
}): Promise<ArrivalPromise> {
  const expoDeviceId = await getOrCreateDeviceId();
  const body = await call<{ promise: ArrivalPromise }>({
    method: "POST",
    body: JSON.stringify({ action: "create", ...args, expoDeviceId }),
  });
  return body.promise;
}

export async function cancelPromise(id: string): Promise<void> {
  await call<{ ok: true }>({ method: "POST", body: JSON.stringify({ action: "cancel", id }) });
}

export async function refreshPromise(id: string): Promise<ArrivalPromise> {
  const body = await call<{ promise: ArrivalPromise }>({
    method: "POST",
    body: JSON.stringify({ action: "refresh", id }),
  });
  return body.promise;
}

export async function adjustPromise(id: string, targetArrivalUnix: number): Promise<ArrivalPromise> {
  const body = await call<{ promise: ArrivalPromise }>({
    method: "POST",
    body: JSON.stringify({ action: "adjust", id, targetArrivalUnix }),
  });
  return body.promise;
}

/** Poll-light hook: refreshes on mount and every minute while mounted. */
export function useArrivalPromises(enabled: boolean) {
  const [promises, setPromises] = useState<ArrivalPromise[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setPromises([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await listPromises();
      setPromises(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your arrivals.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
    if (!enabled) return;
    const id = setInterval(() => void reload(), 60_000);
    return () => clearInterval(id);
  }, [enabled, reload]);

  const active = useMemo(
    () => promises.filter((p) => p.status !== "cancelled" && p.status !== "done"),
    [promises],
  );

  return { promises: active, loading, error, reload };
}
