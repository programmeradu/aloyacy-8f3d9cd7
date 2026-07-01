// Tiny observable paywall store — mirrors `src/lib/paywall-store.ts`.
// A PaywallSheet mounted at the app root subscribes to `isOpen` and
// renders the sheet when any component calls `paywallStore.open()`.

import { useSyncExternalStore } from "react";

type Listener = () => void;
let open = false;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const paywallStore = {
  open() {
    if (!open) {
      open = true;
      emit();
    }
  },
  close() {
    if (open) {
      open = false;
      emit();
    }
  },
  toggle() {
    open = !open;
    emit();
  },
  isOpen() {
    return open;
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function usePaywallOpen(): boolean {
  return useSyncExternalStore(
    (cb) => paywallStore.subscribe(cb),
    () => paywallStore.isOpen(),
    () => false,
  );
}
