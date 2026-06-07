// Edge-safe OG image renderer — rasterizes to PNG via workers-og (satori
// + resvg-wasm) so previews render on Facebook, WhatsApp, Twitter/X,
// iMessage, LinkedIn and every other platform that silently drops SVG.
//
// Endpoints declare the layout as an HTML string (Satori parses a small
// CSS-in-HTML subset); this file owns tokens, fonts, and the response
// shape so every card is visually consistent.

import { ImageResponse, loadGoogleFont } from "workers-og";

export const OG_PALETTE = {
  limestone: "#f3ede1",
  limestoneSoft: "#faf5ea",
  white: "#ffffff",
  ink: "#1F1E18",
  inkSoft: "#5a5246",
  aegean: "#3F9BB2",
  aegeanDeep: "#1F6C82",
  ochre: "#C9853A",
  olive: "#3F4A36",
  line: "rgba(31,30,24,0.12)",
} as const;

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** HTML-escape for safe embedding inside satori HTML. */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Truncate copy with an ellipsis so it never breaks the card layout. */
export function clip(s: string, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Font families exposed to satori. Kept close to the app's design system.
export const OG_FONT_DISPLAY = "Bricolage Grotesque";
export const OG_FONT_BODY = "Geist";

// Fonts are fetched from Google once per Worker isolate and reused
// across every render. Weights match what the cards actually use.
type FontEntry = { name: string; weight: 500 | 700 | 800; data: ArrayBuffer; style: "normal" };
let fontsPromise: Promise<FontEntry[]> | null = null;

function loadFonts(): Promise<FontEntry[]> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = Promise.all([
    loadGoogleFont({ family: "Bricolage Grotesque", weight: 800 }).then((data) => ({
      name: OG_FONT_DISPLAY,
      weight: 800 as const,
      data,
      style: "normal" as const,
    })),
    loadGoogleFont({ family: "Geist", weight: 500 }).then((data) => ({
      name: OG_FONT_BODY,
      weight: 500 as const,
      data,
      style: "normal" as const,
    })),
    loadGoogleFont({ family: "Geist", weight: 700 }).then((data) => ({
      name: OG_FONT_BODY,
      weight: 700 as const,
      data,
      style: "normal" as const,
    })),
  ]).catch((err) => {
    // Reset so the next request can retry rather than caching a failure.
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

/** Render an HTML card to a PNG Response with crawler-friendly headers. */
export async function ogPngResponse(html: string, cacheSeconds = 60): Promise<Response> {
  const fonts = await loadFonts();
  const res = new ImageResponse(html, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    format: "png",
    fonts,
  });
  // Re-wrap so we control cache headers (ImageResponse only sets Content-Type).
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=300`,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
