// Shared palette and backdrop artwork for the Aloya share cards.
// Produces a 1080×1350 PNG composed of a bespoke Cyprus-context background
// + editorial typography. Returns a Blob suitable for navigator.share({ files })
// and a data URL for in-app preview.
//
// Background pick is deterministic per stop (so the same stop always renders
// the same beautiful image), biased by name/agency keywords and time of day.

import { pickPlanBackdrop, pickStopBackdrop } from "@aloya/core/share-card-copy";
import oldtown from "@/assets/share/share-oldtown.jpg";
import coastDusk from "@/assets/share/share-coast-dusk.jpg";
import mountain from "@/assets/share/share-mountain.jpg";
import coastRoad from "@/assets/share/share-coastroad.jpg";
import harborNight from "@/assets/share/share-harbor-night.jpg";
import urbanMorning from "@/assets/share/share-urban-morning.jpg";

// Hex equivalents of the brand oklch tokens — kept inline because canvas
// can't read CSS custom properties reliably across all browsers.
export const C = {
  limestone: "#FAF6EE",
  limestoneSoft: "#F2EBD9",
  aegean: "#5FA3B3",
  aegeanSoft: "#DDE9EB",
  aegeanDeep: "#2F6E80",
  ochre: "#C28C44",
  ochreSoft: "#F0DDB6",
  olive: "#4A5240",
  oliveSoft: "#7A826F",
  ink: "#1E221C",
  inkSoft: "#4B4F45",
};

export type Bg = { src: string; mood: "warm" | "cool" | "neutral" };

export const BG: Record<string, Bg> = {
  oldtown: { src: oldtown, mood: "warm" },
  coastDusk: { src: coastDusk, mood: "cool" },
  mountain: { src: mountain, mood: "neutral" },
  coastRoad: { src: coastRoad, mood: "warm" },
  harborNight: { src: harborNight, mood: "cool" },
  urbanMorning: { src: urbanMorning, mood: "neutral" },
};

export function pickBg(stop: { id: string; name: string; agency: string }): Bg {
  return BG[pickStopBackdrop(stop)];
}

export function pickPlanBg(destination: string): Bg {
  return BG[pickPlanBackdrop(destination)];
}
