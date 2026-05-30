// Edge-safe OG image renderer. Loads brand fonts once per isolate and
// exposes a helper for the two share endpoints (group + plan) to render
// 1200×630 PNGs from an HTML string.
//
// Fonts and options are shared so both cards feel like one system. The
// endpoints only own their layout + copy.

import { ImageResponse, loadGoogleFont } from "workers-og";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Editorial palette (mirrors src/styles.css tokens).
export const OG_PALETTE = {
  limestone: "#f3ede1",
  limestoneSoft: "#faf5ea",
  ink: "#1F1E18",
  inkSoft: "#5a5246",
  aegean: "#3F9BB2",
  aegeanDeep: "#1F6C82",
  ochre: "#C9853A",
  olive: "#3F4A36",
  line: "rgba(31,30,24,0.12)",
} as const;

// Bricolage Grotesque (display) + Geist (body/mono). Loaded once per
// isolate — subsequent renders reuse the cached ArrayBuffers.
let fontPromise: Promise<
  Array<{ name: string; data: ArrayBuffer; weight: 500 | 700 | 800; style: "normal" }>
> | null = null;

function loadFonts() {
  if (fontPromise) return fontPromise;
  fontPromise = (async () => {
    const [display, body, mono] = await Promise.all([
      loadGoogleFont({ family: "Bricolage Grotesque", weight: 800 }),
      loadGoogleFont({ family: "Geist", weight: 500 }),
      loadGoogleFont({ family: "Geist", weight: 700 }),
    ]);
    return [
      { name: "Display", data: display, weight: 800 as const, style: "normal" as const },
      { name: "Body", data: body, weight: 500 as const, style: "normal" as const },
      { name: "Body", data: mono, weight: 700 as const, style: "normal" as const },
    ];
  })();
  return fontPromise;
}

/** Render an OG card from an HTML string. Returns a Response (image/png). */
export async function renderOgCard(html: string, cacheSeconds = 60): Promise<Response> {
  try {
    const fonts = await loadFonts();
    const image = new ImageResponse(html, {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      format: "png",
      fonts,
      headers: {
        // Short edge cache so the preview refreshes near-real-time. Social
        // crawlers apply their own (much longer) cache — we can't beat that,
        // but this is honest about what we can control.
        "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=300`,
        "Access-Control-Allow-Origin": "*",
      },
    });
    return image;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`og render failed: ${msg}`, {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

/** Escape a string for safe embedding in the OG HTML template. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Truncate copy with an ellipsis so it never breaks the card layout. */
export function clip(s: string, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
