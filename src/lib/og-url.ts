// Where crawlers fetch share images from. Defaults to the production host;
// a deploy on another host (workers.dev) sets VITE_OG_ORIGIN at build time so
// its own /api/public/og/* cards are used instead of the old site's.
export const OG_ORIGIN: string =
  (import.meta.env.VITE_OG_ORIGIN as string | undefined)?.replace(/\/+$/, "") ||
  "https://app.aloya.cy";

export const ogImage = (path: string): string => `${OG_ORIGIN}${path}`;
