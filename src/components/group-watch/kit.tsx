// Shared primitives for the public group-watch page: row shapes, the member
// colour system, and the small chrome pieces every section reuses.

import type { ReactNode } from "react";
import heroArtAsset from "@/assets/group-converge-hero.jpg.asset.json";

export const heroArt = heroArtAsset.url;

export const MEMBER_TOKEN_KEY = (code: string) => `aloya.group.${code}.token`;
export const PING_INTERVAL_MS = 25_000;

export type GroupRow = {
  id: string;
  code: string;
  destination_label: string;
  destination_lat: number;
  destination_lng: number;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
};

export type MemberRow = {
  id: string;
  group_id: string;
  display_name: string;
  origin_label: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_updated: string | null;
  eta_minutes: number | null;
  status: string;
  is_creator: boolean;
  joined_at: string;
};

export const MEMBER_TONES = ["aegean", "ochre", "olive", "ink"] as const;
export type Tone = (typeof MEMBER_TONES)[number];

export function toneClasses(tone: Tone) {
  switch (tone) {
    case "aegean":
      return {
        dot: "bg-aegean-deep",
        ring: "ring-aegean-deep/30",
        chip: "bg-aegean-soft/60 text-aegean-deep",
      };
    case "ochre":
      return {
        dot: "bg-ochre",
        ring: "ring-ochre/40",
        chip: "bg-ochre/15 text-[oklch(0.42_0.11_60)]",
      };
    case "olive":
      return {
        dot: "bg-olive",
        ring: "ring-olive/40",
        chip: "bg-olive/15 text-[oklch(0.38_0.06_120)]",
      };
    case "ink":
    default:
      return { dot: "bg-ink", ring: "ring-ink/30", chip: "bg-ink/10 text-ink" };
  }
}

/** Tone for the member at a given position in the ordered list. */
export function toneForIndex(index: number): Tone {
  return MEMBER_TONES[Math.abs(index) % MEMBER_TONES.length];
}

/** One-shot geolocation read that resolves null instead of throwing. */
export function readPosition(
  options: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8_000 },
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      options,
    );
  });
}

export function Shell({ children }: { children: ReactNode }) {
  return <main className="min-h-dvh bg-limestone text-ink">{children}</main>;
}

export function PulseDot() {
  return (
    <span className="relative inline-flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-aegean-deep opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-aegean-deep" />
    </span>
  );
}
