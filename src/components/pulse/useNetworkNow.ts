// The one hook every Pulse surface reads for live punctuality. Same snapshot as
// the map (useRealtime), same definition everywhere (computeNetworkNow).
import { useMemo } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { getRoute } from "@/lib/gtfs";
import { computeNetworkNow } from "@/lib/network-now";

const agencyOf = (routeId: string) => getRoute(routeId)?.agency;

export function useNetworkNow() {
  const { data, isLoading } = useRealtime();
  const now = useMemo(() => (data ? computeNetworkNow(data, agencyOf) : null), [data]);
  return { now, vehicles: data?.vehicles ?? [], loading: isLoading };
}
