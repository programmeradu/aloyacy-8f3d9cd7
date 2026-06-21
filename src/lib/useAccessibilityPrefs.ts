// Hook around AccessibilityPrefs: instant cached read, cloud sync when
// the user is known, optimistic local updates with background save.

import { useEffect, useState, useCallback } from "react";
import {
  type AccessibilityPrefs,
  DEFAULT_PREFS,
  readCached,
  fetchFromCloud,
  savePrefs,
} from "./accessibility-prefs";
import { useAuth } from "./useAuth";

export function useAccessibilityPrefs() {
  const { user, loading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(() =>
    typeof window === "undefined" ? DEFAULT_PREFS : readCached(),
  );
  const [synced, setSynced] = useState(false);

  // Cloud sync on auth resolve.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSynced(true);
      return;
    }
    let cancelled = false;
    void fetchFromCloud(user.id).then((p) => {
      if (cancelled) return;
      setPrefs(p);
      setSynced(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const update = useCallback(
    (patch: Partial<AccessibilityPrefs>) => {
      setPrefs((cur) => {
        const next: AccessibilityPrefs = { ...cur, ...patch };
        void savePrefs(user?.id ?? null, next);
        return next;
      });
    },
    [user?.id],
  );

  return { prefs, update, synced };
}
