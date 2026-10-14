// Keeps the signed-in user's cached data fresh across tabs/devices.
//
// Supabase Realtime is gone (D1 has no change feed), so instead of
// postgres_changes subscriptions we invalidate the same React Query caches
// when the tab regains focus/visibility and on a slow interval while visible.
// Mount once at the root.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

export const USER_DATA_POLL_MS = 60_000;

export const USER_DATA_QUERY_KEYS: string[][] = [
  ["scheduled-departures"],
  ["reminders"],
  ["commute-suggestion"],
  ["trip-suggestions"],
];
const PUBLIC_QUERY_KEYS: string[][] = [["alert-counters"], ["service-alerts"]];

export function useUserDataRealtime() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const keys = userId ? [...PUBLIC_QUERY_KEYS, ...USER_DATA_QUERY_KEYS] : PUBLIC_QUERY_KEYS;
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    };
    const timer = window.setInterval(refresh, USER_DATA_POLL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId, queryClient]);
}
