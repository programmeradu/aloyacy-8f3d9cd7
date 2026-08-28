// Last tap on a stop ask this ride. Device-local — not a server fact.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shouldOpenStopAsk } from "@aloya/core/stop-ask";

const KEY = "aloya:stop-ask-at";

export async function readStopAskAt(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function writeStopAskAt(at: number): Promise<void> {
  await AsyncStorage.setItem(KEY, String(at));
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
      void writeStopAskAt(at);
      qc.setQueryData(["stop-ask-at"], at);
    },
  };
}
