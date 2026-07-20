// Shared plumbing behind the two arrival-promise surfaces: the query cache
// they both read, the push-device handshake, and a wall clock that ticks.
// Kept out of the component file so the card stays hot-reloadable.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listArrivalPromises } from "@/lib/arrival-promise.functions";
import { saveSubscription } from "@/lib/push.functions";
import { getDeviceId, getOrCreatePushSubscription } from "@/lib/pwa";
import { useTick } from "@/hooks/use-tick";

export type PromisePoint = { lat: number; lng: number; label: string };

export const ARRIVAL_PROMISE_QUERY_KEY = ["arrival-promises"] as const;

/** Wall-clock seconds that re-render on a fixed cadence. */
export function useNowUnix(intervalMs: number): number {
  const tick = useTick(intervalMs);
  // The tick is the whole point of the dependency — it is what re-reads the clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => Math.floor(Date.now() / 1000), [tick]);
}





/** Ask for notification permission, but never block the promise on it. */
export async function ensurePushDevice(): Promise<string | undefined> {
  try {
    const deviceId = getDeviceId();
    const sub = await getOrCreatePushSubscription();
    if (sub.ok) {
      await saveSubscription({
        data: {
          deviceId,
          subscription: sub.subscription,
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
    }
    return deviceId;
  } catch {
    return undefined;
  }
}

export function useArrivalPromises(enabled: boolean) {
  const list = useServerFn(listArrivalPromises);
  return useQuery({
    queryKey: ARRIVAL_PROMISE_QUERY_KEY,
    queryFn: () => list(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
