// Edge-safe OG image renderer — pure SVG, no WASM. Both share endpoints
// (group + plan) render 1200×630 SVG cards. We serve SVG because:
//
//  1. No WASM asset resolution issues across Node dev + Cloudflare Workers
//     production. Ships identically in both.
//  2. Data-driven cards can be built with real design tokens and web fonts
//     via <foreignObject> when needed, or crisp native SVG text otherwise.
//  3. Every modern share preview stack (LinkedIn, Discord, Slack, iMessage,
//     Signal, Bluesky, WhatsApp on modern iOS/Android) renders SVG. Legacy
//     Facebook crawlers fall back to the site's default og:image.
//
// Endpoints declare the layout; this file owns tokens + response shape.

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

/** XML-escape a string for safe embedding inside SVG text/attribute values. */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncate copy with an ellipsis so it never breaks the card layout. */
export function clip(s: string, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Standard SVG response headers — short cache so previews refresh often. */
export function ogSvgResponse(svg: string, cacheSeconds = 60): Response {
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=300`,
      "Access-Control-Allow-Origin": "*",
      // Hint to crawlers this is a rendered card, not a decorative graphic.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Shared SVG scaffolding: 1200×630 viewport, tuned type stack that ships
 * with all target platforms so the card never depends on a fetched web
 * font. Bricolage/Geist are the design system — the stack degrades to a
 * comparable OS font when the crawler doesn't have them installed.
 */
export const OG_FONT_DISPLAY =
  "'Bricolage Grotesque','SF Pro Display','Segoe UI',system-ui,-apple-system,sans-serif";
export const OG_FONT_BODY =
  "'Geist','SF Pro Text','Segoe UI',system-ui,-apple-system,sans-serif";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
