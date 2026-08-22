// Session-scoped unlock state for the internal QA console. Lives apart from
// the gate component so the module stays fast-refresh friendly.

import { useEffect, useState } from "react";

export const QA_STORAGE_KEY = "aloya-qa-unlocked";

/** Reads the per-session unlock flag after hydration. */
export function useQaUnlocked(): [boolean, () => void] {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setUnlocked(window.sessionStorage.getItem(QA_STORAGE_KEY) === "1");
  }, []);
  return [unlocked, () => setUnlocked(true)];
}
