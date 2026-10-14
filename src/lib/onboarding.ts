// Onboarding state lives in `user_settings.onboarded_at`. Read/write happens
// through server functions (session cookie) because every rider has an
// anonymous session by the time __root mounts. We cache a yes/no in localStorage to
// avoid a network round-trip on every cold start.

import { getUserSettings, saveUserSettings } from "@/lib/user-data.functions";

const CACHE_KEY = "aloya:onboarded";

export function isOnboardedCached(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(CACHE_KEY);
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export async function fetchOnboardedAt(userId: string): Promise<boolean> {
  void userId;
  const res = await getUserSettings().catch(() => null);
  const data = res?.ok ? res.settings : null;
  if (!res?.ok) {
    // Treat read failure as "not onboarded yet" — better to show the welcome
    // screen once too often than to silently skip it.
    return false;
  }
  const done = !!data?.onboarded_at;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CACHE_KEY, done ? "1" : "0");
  }
  return done;
}

export async function markOnboarded(userId: string): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CACHE_KEY, "1");
  }
  void userId;
  const res = await saveUserSettings({ data: { patch: { onboarded_at: new Date().toISOString() } } }).catch(
    (e: Error) => ({ ok: false as const, error: e.message }),
  );
  if (!res.ok) console.warn("[onboarding] mark failed:", res.error);
}
