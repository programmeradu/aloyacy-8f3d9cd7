// Edge-safe OG image renderer — hand-rolled SVG, no WASM.
//
// Historical note: we tried workers-og (satori + resvg-wasm) to emit PNG so
// every social platform would render the card, but its Yoga WASM import is
// not resolvable in the Cloudflare Worker bundler and the failure took the
// entire SSR worker down (every API route returned a Cloudflare 500 with no
// CORS headers). Until we ship a Worker-safe rasterizer, we stay on SVG —
// it renders in Facebook, WhatsApp, Twitter/X, iMessage previews with the
// current caching; a few edge clients fall back to no image, which is fine.

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

/** XML-escape for safe embedding inside SVG text nodes and attributes. */
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

/** Wrap an SVG string in an image/svg+xml Response with crawler-friendly headers. */
export function ogSvgResponse(svg: string, cacheSeconds = 60): Response {
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=300`,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
