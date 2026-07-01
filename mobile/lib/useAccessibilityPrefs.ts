// Accessibility preferences persisted on-device.
//
// Native mirror of `src/lib/accessibility-prefs.ts`. Cloud sync
// intentionally omitted for now — the mobile app uses local storage
// only, matching the anonymous-first behavior of the rest of the
// wallet. When the rider signs in we can add a follow-up sync.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "aloya.a11y.v1";

export type AccessibilityPrefs = {
  stepFree: boolean;
  preferShade: boolean;
  maxWalkMeters: number | null;
};

export const DEFAULT_PREFS: AccessibilityPrefs = {
  stepFree: false,
  preferShade: false,
  maxWalkMeters: null,
};

let cache: AccessibilityPrefs | null = null;

async function read(): Promise<AccessibilityPrefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<AccessibilityPrefs>) } : DEFAULT_PREFS;
  } catch {
    cache = DEFAULT_PREFS;
  }
  return cache;
}

async function write(prefs: AccessibilityPrefs): Promise<void> {
  cache = prefs;
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}

export function useAccessibilityPrefs() {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(cache ?? DEFAULT_PREFS);
  useEffect(() => {
    if (cache) return;
    void read().then(setPrefs);
  }, []);
  return {
    prefs,
    update(patch: Partial<AccessibilityPrefs>) {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      void write(next);
    },
  };
}
