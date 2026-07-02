// Edge-safe OG image renderer.
//
// We author cards as hand-rolled SVG (brand-accurate, no Yoga/satori runtime),
// then rasterize to PNG on the Cloudflare Worker with @resvg/resvg-wasm.
// PNG is non-negotiable — WhatsApp, iMessage, Facebook, LinkedIn, Slack and
// Twitter/X all reject SVG for og:image, so shared previews stay blank
// otherwise. Fonts are bundled (Bricolage Grotesque + Geist) so text renders
// exactly as it does in-app; no system fonts exist in the Worker sandbox.

import { initWasm, Resvg } from "@resvg/resvg-wasm";
// @ts-expect-error — Vite/Cloudflare Worker bundler resolves .wasm to a
// WebAssembly.Module at build time.
import resvgWasmModule from "@resvg/resvg-wasm/index_bg.wasm";
import {
  BRICOLAGE_BOLD_B64,
  GEIST_BOLD_B64,
  GEIST_MEDIUM_B64,
} from "./og-fonts.server";

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

// ---- WASM + font bootstrap (module-scoped, initialized once per isolate) ----

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(resvgWasmModule as WebAssembly.Module);
  return wasmReady;
}

let fontBuffers: Uint8Array[] | null = null;
function loadFonts(): Uint8Array[] {
  if (!fontBuffers) {
    fontBuffers = [
      b64ToBytes(BRICOLAGE_BOLD_B64),
      b64ToBytes(GEIST_MEDIUM_B64),
      b64ToBytes(GEIST_BOLD_B64),
    ];
  }
  return fontBuffers;
}

/** Rasterize an SVG string to a PNG Response with crawler-friendly headers. */
export async function ogPngResponse(
  svg: string,
  cacheSeconds = 60,
): Promise<Response> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: OG_WIDTH },
    background: OG_PALETTE.limestone,
    font: {
      fontBuffers: loadFonts(),
      loadSystemFonts: false,
      defaultFontFamily: "Geist",
      sansSerifFamily: "Geist",
      serifFamily: "Bricolage Grotesque",
    },
    textRendering: 2,
    shapeRendering: 2,
  });
  const png = resvg.render().asPng();
  return new Response(png as BlobPart, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=300`,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
