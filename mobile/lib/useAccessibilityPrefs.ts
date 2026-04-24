// Accessibility preferences — local-first with opportunistic cloud sync.
//
// Mirrors `src/lib/accessibility-prefs.ts` on web. Anonymous riders keep
// prefs in AsyncStorage; once signed in we upsert into
// `user_settings.accessibility_prefs` so the same toggles roam across web
// and every device.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

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

function normalise(p: Partial<AccessibilityPrefs> | null | undefined): AccessibilityPrefs {
  if (!p || typeof p !== "object") return DEFAULT_PREFS;
  const cap =
    typeof p.maxWalkMeters === "number" && Number.isFinite(p.maxWalkMeters)
      ? Math.max(100, Math.min(3000, Math.round(p.maxWalkMeters)))
      : null;
  return {
    stepFree: !!p.stepFree,
    preferShade: !!p.preferShade,
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
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("user_settings")
      .select("accessibility_prefs")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data?.accessibility_prefs) return null;
    const merged = normalise(data.accessibility_prefs as Partial<AccessibilityPrefs>);
    await writeLocal(merged);
    return merged;
  } catch {
    return null;
  }
}

async function pushToCloud(prefs: AccessibilityPrefs): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("user_settings")
      .upsert(
        { user_id: user.id, accessibility_prefs: prefs },
        { onConflict: "user_id" },
      );
  } catch {
    // offline / unauthenticated — local copy is authoritative.
  }
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
