// Wave 2.2 — Accessibility-weighted routing.
//
// Per-rider preferences that the planner uses as *ranking weights*, not
// hard filters. We never refuse to plan a trip because of accessibility
// settings — we just push options that violate them down the list and
// surface the trade-off in the UI so the rider can override.
//
// Persistence:
// - Cached in localStorage for instant boot + offline reads.
// - Mirrored to user_settings.accessibility_prefs (JSONB) for cross-device sync.
//
// Honesty: we only expose toggles whose effect we can actually deliver
// today. Vehicle-level "low floor" is stored for forward-compat but the
// planner doesn't yet penalise on it — we'll wire it up the moment we
// ingest the per-vehicle accessibility flag from GTFS-RT VehiclePosition.

import { supabase } from "@/integrations/supabase/client";

const CACHE_KEY = "aloya:a11yPrefs";

export type AccessibilityPrefs = {
  /** Avoid stops/walks with known steps or curbs. Adds penalty to non-step-free legs. */
  stepFree: boolean;
  /** Prefer waits at shaded/sheltered stops (matters in Cyprus summer). */
  preferShade: boolean;
  /** Stored for future use when vehicle-level accessibility lands. */
  lowFloor: boolean;
  /**
   * Soft cap on TOTAL walking distance for an itinerary, in meters.
   * `null` = no cap. We never filter, but we penalise heavily above the cap.
   */
  maxWalkMeters: number | null;
};

export const DEFAULT_PREFS: AccessibilityPrefs = {
  stepFree: false,
  preferShade: false,
  lowFloor: false,
  maxWalkMeters: null,
};

/** True when at least one weighting is active — used to decide whether to ship prefs to the planner at all. */
export function isActive(p: AccessibilityPrefs): boolean {
  return p.stepFree || p.preferShade || p.lowFloor || p.maxWalkMeters !== null;
}

export function readCached(): AccessibilityPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AccessibilityPrefs>;
    return normalise(parsed);
  } catch {
    return DEFAULT_PREFS;
  }
}

function writeCache(p: AccessibilityPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    // localStorage full or disabled — fail soft.
  }
}

/** Clamp/coerce arbitrary input into a safe AccessibilityPrefs. */
export function normalise(p: Partial<AccessibilityPrefs> | null | undefined): AccessibilityPrefs {
  if (!p || typeof p !== "object") return DEFAULT_PREFS;
  const cap = typeof p.maxWalkMeters === "number" && Number.isFinite(p.maxWalkMeters)
    ? Math.max(100, Math.min(3000, Math.round(p.maxWalkMeters)))
    : null;
  return {
    stepFree: !!p.stepFree,
    preferShade: !!p.preferShade,
    lowFloor: !!p.lowFloor,
    maxWalkMeters: cap,
  };
}

export async function fetchFromCloud(userId: string): Promise<AccessibilityPrefs> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("accessibility_prefs")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return readCached();
  const merged = normalise(data.accessibility_prefs as Partial<AccessibilityPrefs> | null);
  writeCache(merged);
  return merged;
}

export async function savePrefs(userId: string | null, next: AccessibilityPrefs): Promise<void> {
  writeCache(next);
  if (!userId) return; // anon riders keep prefs in localStorage only
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: userId, accessibility_prefs: next },
      { onConflict: "user_id" },
    );
  if (error) console.warn("[a11y-prefs] save failed:", error.message);
}
