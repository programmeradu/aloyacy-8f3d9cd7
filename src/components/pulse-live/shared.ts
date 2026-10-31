// Small helpers shared by the live-signal cards.

import type { PulseLiveBundle } from "@/lib/pulse-live.functions";

type AirPayload = NonNullable<PulseLiveBundle["air"]>;

export type Locale = "en" | "el";

export function relativeAgo(iso: string, isEl: boolean): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return "";
  const min = Math.max(1, Math.round(diff / 60_000));
  if (min < 60) return isEl ? `πριν ${min} λ.` : `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return isEl ? `πριν ${h} ώ.` : `${h}h ago`;
  const d = Math.round(h / 24);
  return isEl ? `πριν ${d} ημ.` : `${d}d ago`;
}

/** Only surface the air card when the reading is actually notable. */
export function shouldShowAir(p: NonNullable<AirPayload>): boolean {
  if (p.dustAlert) return true;
  return p.band === "moderate" || p.band === "poor" || p.band === "very-poor";
}

/** Feed copy in Roam's voice: spaced dashes and middle dots become commas. */
export function tidy(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\s*[·•]\s*/g, ", ")
    .replace(/\s+[–—-]\s+/g, ", ")
    .replace(/\s*›\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .trim();
}
