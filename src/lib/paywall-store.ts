import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const paywallStore = {
  open: () => {
    if (!open) {
      open = true;
      emit();
    }
  },
  close: () => {
    if (open) {
      open = false;
      emit();
    }
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => open,
};

export function usePaywallOpen() {
  return useSyncExternalStore(
    paywallStore.subscribe,
    paywallStore.get,
    () => false,
  );
}
