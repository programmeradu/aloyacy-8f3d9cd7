// React Query hook for the live GTFS-RT feed.
import { useQuery } from "@tanstack/react-query";
import type { RealtimeSnapshot } from "./gtfs-rt.server";

async function fetchRealtime(): Promise<RealtimeSnapshot> {
  const res = await fetch("/api/public/realtime");
  if (!res.ok) throw new Error("realtime fetch failed");
  return res.json();
}

export function useRealtime() {
  return useQuery({
    queryKey: ["gtfs-rt"],
    queryFn: fetchRealtime,
    refetchInterval: 20_000,
    staleTime: 15_000,
  });
}
