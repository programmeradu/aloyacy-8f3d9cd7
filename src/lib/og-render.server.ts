// Edge-safe OG image renderer shared by the group + plan share endpoints.
// Uses @vercel/og (Satori + Resvg WASM) which works both in local Node dev
// and in production Cloudflare Workers via the same import.
//
// Fonts and palette are shared so both cards feel like one system; only the
// endpoints own their layout + copy.

import type { Font } from "satori";

const BRICOLAGE_800_URL =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&display=swap";
const GEIST_500_URL =
  "https://fonts.googleapis.com/css2?family=Geist:wght@500&display=swap";
const GEIST_700_URL =
  "https://fonts.googleapis.com/css2?family=Geist:wght@700&display=swap";
const CSS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

let fontsPromise: Promise<Font[]> | null = null;

async function loadFontFromGoogleCss(cssUrl: string): Promise<ArrayBuffer> {
  const css = await fetch(cssUrl, { headers: { "User-Agent": CSS_UA } }).then((r) => r.text());
  const match = css.match(/src:\s*url\((https:[^)]+\.(?:ttf|otf|woff2?))\)/i);
  if (!match) throw new Error(`no font url in ${cssUrl}`);
  const ttf = await fetch(match[1]).then((r) => r.arrayBuffer());
  return ttf;
}

export function loadOgFonts(): Promise<Font[]> {
  if (fontsPromise) return fontsPromise;
  const p: Promise<Font[]> = (async () => {
    const [display, body, bodyBold] = await Promise.all([
      loadFontFromGoogleCss(BRICOLAGE_800_URL),
      loadFontFromGoogleCss(GEIST_500_URL),
      loadFontFromGoogleCss(GEIST_700_URL),
    ]);
    return [
      { name: "Display", data: display, weight: 800 as const, style: "normal" as const },
      { name: "Body", data: body, weight: 500 as const, style: "normal" as const },
      { name: "Body", data: bodyBold, weight: 700 as const, style: "normal" as const },
    ];
  })();
  fontsPromise = p;
  p.catch(() => {
    // Reset so the next request can retry rather than caching a rejection.
    if (fontsPromise === p) fontsPromise = null;
  });
  return p;
}


/** Truncate copy with an ellipsis so it never breaks the card layout. */
export function clip(s: string, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Standard cache headers — short so previews refresh near-real-time. */
export function ogCacheHeaders(seconds = 60): HeadersInit {
  return {
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=300`,
    "Access-Control-Allow-Origin": "*",
  };
}
