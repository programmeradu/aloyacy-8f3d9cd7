// Last tap on a stop ask this ride. Device-local — not a server fact.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shouldOpenStopAsk } from "@aloya/core/stop-ask";

const KEY = "aloya:stop-ask-at";

export function readStopAskAt(): number | null {
  if (typeof window === "undefined") return null;
  const n = Number(localStorage.getItem(KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function writeStopAskAt(at: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, String(at));
}

export function useStopAskGate(): { open: boolean; markAsked: () => void } {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["stop-ask-at"],
    queryFn: () => readStopAskAt(),
    staleTime: Infinity,
  });
  return {
    open: shouldOpenStopAsk(q.data ?? null, Date.now()),
    markAsked: () => {
      const at = Date.now();
      writeStopAskAt(at);
      qc.setQueryData(["stop-ask-at"], at);
    },
  };
}
