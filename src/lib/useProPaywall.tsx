import { useCallback, useState } from "react";
import { useProSubscription } from "./usePro";
import { PaywallSheet } from "@/components/PaywallSheet";

/**
 * Imperative paywall helper. `requirePro(fn)` runs fn() if user is Pro,
 * otherwise opens the paywall sheet. Render `paywall` once in the tree.
 */
export function useProPaywall() {
  const { isPro, loading } = useProSubscription();
  const [open, setOpen] = useState(false);

  const requirePro = useCallback(
    (fn: () => void) => {
      if (isPro) {
        fn();
      } else {
        setOpen(true);
      }
    },
    [isPro],
  );

  const paywall = <PaywallSheet open={open} onClose={() => setOpen(false)} />;

  return { isPro, loading, requirePro, openPaywall: () => setOpen(true), paywall };
}
