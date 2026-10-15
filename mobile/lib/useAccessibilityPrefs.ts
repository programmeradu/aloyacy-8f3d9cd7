// Accessibility preferences — local-first with opportunistic cloud sync.
//
// Mirrors `src/lib/accessibility-prefs.ts` on web. Anonymous riders keep
// prefs in AsyncStorage; once signed in we upsert into
// Every device has an Aloya session (guest first, email optional); the
// prefs are mirrored to the rider's synced settings through
// /api/public/user-settings so the same toggles roam across web and devices.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { fetchRemoteSettings, saveRemoteSettings } from "./auth";

const KEY = "aloya.a11y.v1";

export type AccessibilityPrefs = {
  stepFree: boolean;
  preferShade: boolean;
  lowFloor: boolean;
  maxWalkMeters: number | null;
};

export const DEFAULT_PREFS: AccessibilityPrefs = {
  stepFree: false,
  preferShade: false,
  lowFloor: false,
  maxWalkMeters: null,
};

let cache: AccessibilityPrefs | null = null;

function normalise(p: Partial<AccessibilityPrefs> | null | undefined): AccessibilityPrefs {
  if (!p || typeof p !== "object") return DEFAULT_PREFS;
  const cap =
    typeof p.maxWalkMeters === "number" && Number.isFinite(p.maxWalkMeters)
      ? Math.max(100, Math.min(3000, Math.round(p.maxWalkMeters)))
      : null;
  return {
    stepFree: !!p.stepFree,
    preferShade: !!p.preferShade,
    lowFloor: !!p.lowFloor,
    maxWalkMeters: cap,
  };
}

async function readLocal(): Promise<AccessibilityPrefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? normalise(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    cache = DEFAULT_PREFS;
  }
  return cache;
}

async function writeLocal(prefs: AccessibilityPrefs): Promise<void> {
  cache = prefs;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // best effort
  }
}

async function syncFromCloud(): Promise<AccessibilityPrefs | null> {
  const remote = await fetchRemoteSettings();
  const raw = remote?.accessibility_prefs;
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) return null;
  const merged = normalise(raw as Partial<AccessibilityPrefs>);
  await writeLocal(merged);
  return merged;
}

async function pushToCloud(prefs: AccessibilityPrefs): Promise<void> {
  // Offline / no session: the local copy is authoritative.
  await saveRemoteSettings({ accessibility_prefs: prefs });
}

export function useAccessibilityPrefs() {
  const [prefs, setPrefs] = useState<AccessibilityPrefs>(cache ?? DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await readLocal();
      if (!cancelled) setPrefs(local);
      const remote = await syncFromCloud();
      if (!cancelled && remote) setPrefs(remote);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    prefs,
    update(patch: Partial<AccessibilityPrefs>) {
      const next = normalise({ ...prefs, ...patch });
      setPrefs(next);
      void writeLocal(next).then(() => pushToCloud(next));
    },
  };
}
