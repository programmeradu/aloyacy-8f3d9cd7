// Onboarding state lives in `user_settings.onboarded_at`. Read/write happens
// through the browser supabase client because every rider has an anonymous
// session by the time __root mounts. We cache a yes/no in localStorage to
// avoid a network round-trip on every cold start.

import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "aloya:onboarded";

export function isOnboardedCached(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(CACHE_KEY);
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export async function fetchOnboardedAt(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("onboarded_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
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
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: userId, onboarded_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) console.warn("[onboarding] mark failed:", error.message);
}
