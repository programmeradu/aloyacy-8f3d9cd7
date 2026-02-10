import { useCallback } from "react";
import { useProSubscription } from "./usePro";
import { paywallStore } from "./paywall-store";

/**
 * Imperative paywall helper. `requirePro(fn)` runs fn() if user is Pro,
 * otherwise opens the global paywall sheet mounted in __root.
 */
export function useProPaywall() {
  const { isPro, loading } = useProSubscription();

  const requirePro = useCallback(
    (fn: () => void) => {
      if (isPro) fn();
      else paywallStore.open();
    },
    [isPro],
  );

  const openPaywall = useCallback(() => paywallStore.open(), []);

  return { isPro, loading, requirePro, openPaywall };
}
