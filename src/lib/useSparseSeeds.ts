// Sparse-route ids for the C3 ask. Shares the Pulse cache.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCrowdEyes } from "@/lib/crowd-coverage.server";

export function useSparseSeedIds(): Set<string> {
  const fn = useServerFn(getCrowdEyes);
  const { data } = useQuery({
    queryKey: ["pulse-crowd-eyes"],
    queryFn: () => fn(),
    staleTime: 4 * 60_000,
  });
  return useMemo(() => new Set((data?.seeds ?? []).map((s) => s.routeId)), [data]);
}
