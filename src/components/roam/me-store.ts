// Tiny event bus so any avatar button can open the single Me sheet mounted
// in the root layout.
import { useEffect, useState } from "react";

const EVT = "aloya:me-sheet";

export function openMeSheet(view?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT, { detail: { open: true, view } }));
}

export function useMeSheetState() {
  const [state, setState] = useState<{ open: boolean; view?: string }>({ open: false });
  useEffect(() => {
    const on = (e: Event) => setState((e as CustomEvent<{ open: boolean; view?: string }>).detail);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return [state, setState] as const;
}
