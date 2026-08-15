// Brand fonts for edge-side SVG→PNG rasterization of Open Graph cards.
//
// The payloads themselves are data, not code: they live in
// `src/assets/og-fonts.json` (base64, ~380 KB) and are inlined by the bundler
// at build time, so the Worker never needs runtime module or asset resolution.
// Keeping them out of the source tree keeps this module reviewable and keeps
// the repo's line-count metrics honest.
//
// This file stays `.server.ts` so import protection keeps the payload out of
// every client bundle.
import payload from "@/assets/og-fonts.json";

type FontKey = "BRICOLAGE_BOLD_B64" | "GEIST_BOLD_B64" | "GEIST_MEDIUM_B64";

const fonts = payload as Record<FontKey, string>;

function read(key: FontKey): string {
  const value = fonts[key];
  if (!value) {
    throw new Error(`og-fonts: missing font payload "${key}" in og-fonts.json`);
  }
  return value;
}

/** Bricolage Grotesque Bold — display headings on OG cards. */
export const BRICOLAGE_BOLD_B64 = read("BRICOLAGE_BOLD_B64");
/** Geist Bold — emphasised body and numerals. */
export const GEIST_BOLD_B64 = read("GEIST_BOLD_B64");
/** Geist Medium — body copy; the minimum weight the brand allows. */
export const GEIST_MEDIUM_B64 = read("GEIST_MEDIUM_B64");
