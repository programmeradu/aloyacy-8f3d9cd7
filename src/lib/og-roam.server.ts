// Roam share cards (Open Graph, 1200 x 630 PNG).
//
// One look for every shared link: a map drawn from the real network (GTFS
// road shapes where we have them, stop sequences otherwise) on the Roam
// canvas grey, the featured line in ink with ring stops, the stop or place in
// Roam yellow, and a white card with Urbanist type. Every number on a card is
// read from data (the static GTFS, the group, the shared plan); nothing is
// invented, and copy never uses em or en dashes.
//
// Rendered with resvg-wasm (same wasm bootstrap as og-render.server.ts).

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import payload from "@/assets/og-roam-fonts.json";
import routeSeqData from "@/data/route_sequences.json";
import routeStopsData from "@/data/route_stops.json";
import { ROUTES, STOPS, getRoute, getStop, type StaticStop } from "@/lib/gtfs";
import { ALOYA_LOGO_PNG_B64 } from "@/lib/og-logo";

export const W = 1200;
export const H = 630;

export const R = {
  canvas: "#d9d9d5",
  street: "#f4f4f1",
  streetEdge: "#cdcdc8",
  ink: "#171717",
  ink2: "#5e5e5b",
  mute: "#6f6f6a",
  y: "#f6b83c",
  ySoft: "#fdf0d5",
  white: "#ffffff",
  pill: "#eeeeea",
  line: "#e7e7e3",
} as const;

const FONT = "Urbanist";

// ------------------------------------------------------------------ text

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Copy rule: no em or en dashes anywhere on a card. */
export function plain(s: string): string {
  return String(s ?? "")
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rough Urbanist advance width for wrapping without a layout engine. */
export function textWidth(s: string, size: number, weight = 600): number {
  let w = 0;
  for (const ch of s) {
    if (ch === " ") w += 0.25;
    else if ("il.,:;'!|".includes(ch)) w += 0.26;
    else if ("fjrt()".includes(ch)) w += 0.36;
    else if ("mwMW".includes(ch)) w += 0.84;
    else if (/[A-Z0-9]/.test(ch)) w += 0.64;
    else w += 0.54;
  }
  // Calibrated against resvg output for Urbanist 600/800.
  return w * size * (weight >= 800 ? 0.94 : 0.9);
}

/** Greedy word wrap into at most `max` lines, the last one ellipsised. */
export function wrap(s: string, size: number, width: number, max: number, weight = 600): string[] {
  const words = plain(s).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  let used = 0;
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (textWidth(next, size, weight) <= width || !cur) {
      cur = next;
      used = i + 1;
      continue;
    }
    lines.push(cur);
    cur = "";
    if (lines.length === max) break;
    cur = words[i];
    used = i + 1;
  }
  if (lines.length < max && cur) lines.push(cur);
  if (used < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.includes(" ") && textWidth(`${last}\u2026`, size, weight) > width)
      last = last.replace(/\s*\S+$/, "");
    lines[lines.length - 1] = `${last}\u2026`;
  }
  // A single word wider than the box: cut it (callers shrink first).
  return lines.map((l) => {
    let t = l;
    while (textWidth(t, size, weight) > width && t.length > 2) t = `${t.slice(0, -2)}\u2026`;
    return t;
  });
}

export function text(
  x: number,
  y: number,
  s: string,
  o: {
    size: number;
    weight?: number;
    fill?: string;
    anchor?: "start" | "middle" | "end";
    track?: number;
  },
): string {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size}" font-weight="${o.weight ?? 600}" fill="${o.fill ?? R.ink}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.track ? ` letter-spacing="${o.track}"` : ""}>${esc(s)}</text>`;
}

/** Route long names read "A - B - C": where it runs, first to last. */
export function runsBetween(long: string): { from: string; to: string } {
  const parts = String(long ?? "")
    .split(/\s+-\s+/)
    .map((p) => plain(p))
    .filter(Boolean);
  if (parts.length >= 2) return { from: parts[0], to: parts[parts.length - 1] };
  return { from: parts[0] ?? long, to: "" };
}

// ------------------------------------------------------------------ data

export type LatLng = { lat: number; lng: number };
export type Shapes = Record<string, { shapes?: Record<string, string> }>;

let ROUTE_SEQ = routeSeqData as Record<string, string[]>;
let ROUTE_STOPS = routeStopsData as Record<string, string[]>;

/**
 * Swap in the whole-island network read from the raw GTFS feeds
 * (scripts/og-gtfs.ts at build time, og/network.json at run time). The
 * bundled data covers Nicosia and the intercity lines only.
 */
export function setOgNetwork(net: {
  seq: Record<string, string[]>;
  routeStops: Record<string, string[]>;
}): void {
  ROUTE_SEQ = { ...ROUTE_SEQ, ...net.seq };
  ROUTE_STOPS = { ...ROUTE_STOPS, ...net.routeStops };
  STOP_LINES = null;
  PATHS.clear();
}

/** The line's own colour from the feed, as #rrggbb (ink when the feed has none). */
export function routeColor(routeId: string | undefined): string {
  const c = routeId ? getRoute(routeId)?.color : undefined;
  return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c.toLowerCase()}` : R.ink;
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Ink or white, whichever reads better on a line colour. */
export function onColor(hex: string): string {
  const l = lum(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / (lum(R.ink) + 0.05) ? R.white : R.ink;
}

/** Decode a Google encoded polyline (precision 5). */
export function decodePolyline(str: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0;
      let result = 0;
      let b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d;
      else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

type CachedPaths = { paths: LatLng[][]; box: [number, number, number, number] | null };
const PATHS = new Map<string, CachedPaths>();
let PATHS_FOR: Shapes | null = null;

function cachedPaths(routeId: string, shapes: Shapes | null): CachedPaths {
  if (PATHS_FOR !== shapes) {
    PATHS.clear();
    PATHS_FOR = shapes;
  }
  let c = PATHS.get(routeId);
  if (!c) {
    const paths = computePaths(routeId, shapes);
    let box: CachedPaths["box"] = null;
    for (const p of paths)
      for (const q of p) {
        if (!box) box = [q.lat, q.lng, q.lat, q.lng];
        else {
          if (q.lat < box[0]) box[0] = q.lat;
          if (q.lng < box[1]) box[1] = q.lng;
          if (q.lat > box[2]) box[2] = q.lat;
          if (q.lng > box[3]) box[3] = q.lng;
        }
      }
    PATHS.set(routeId, (c = { paths, box }));
  }
  return c;
}

/** Real paths for a route (cached per isolate): GTFS road shapes, else the ordered stops. */
export function routePaths(routeId: string, shapes: Shapes | null): LatLng[][] {
  return cachedPaths(routeId, shapes).paths;
}

function computePaths(routeId: string, shapes: Shapes | null): LatLng[][] {
  const enc = shapes?.[routeId]?.shapes;
  if (enc) {
    const paths = Object.values(enc)
      .map(decodePolyline)
      .filter((p) => p.length > 1);
    if (paths.length) return paths;
  }
  const agency = getRoute(routeId)?.agency;
  const out: LatLng[][] = [];
  for (const dir of ["0", "1"]) {
    const ids = ROUTE_SEQ[`${routeId}|${dir}`];
    if (!ids) continue;
    const pts = ids.map((id) => getStop(id, agency)).filter((s): s is StaticStop => !!s);
    if (pts.length > 1) out.push(pts);
  }
  return out;
}

/** Ordered stops of a route (first direction found). */
export function routeStopList(routeId: string): StaticStop[] {
  const agency = getRoute(routeId)?.agency;
  const ids = ROUTE_SEQ[`${routeId}|0`] ?? ROUTE_SEQ[`${routeId}|1`] ?? ROUTE_STOPS[routeId] ?? [];
  return ids.map((id) => getStop(id, agency)).filter((s): s is StaticStop => !!s);
}

let STOP_LINES: Map<string, Set<string>> | null = null;
/** Line numbers serving a stop, sorted naturally, and their route ids. */
export function linesAtStop(
  stopId: string,
  agency?: string,
): { codes: string[]; routeIds: string[] } {
  if (!STOP_LINES) {
    STOP_LINES = new Map();
    for (const [rid, ids] of Object.entries(ROUTE_STOPS)) {
      const ag = getRoute(rid)?.agency ?? "";
      for (const id of ids) {
        // Stop ids repeat across the city feeds: key by agency too.
        for (const k of [`${ag}:${id}`, id]) {
          let s = STOP_LINES.get(k);
          if (!s) STOP_LINES.set(k, (s = new Set()));
          s.add(rid);
        }
      }
    }
  }
  const routeIds = [
    ...((agency ? STOP_LINES.get(`${agency}:${stopId}`) : undefined) ??
      STOP_LINES.get(stopId) ??
      []),
  ];
  const codes = [...new Set(routeIds.map((r) => getRoute(r)?.short || r))].sort((a, b) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  return { codes, routeIds };
}

export const NETWORK = { stops: STOPS.length, lines: new Set(ROUTES.map((r) => r.short)).size };

/** Road shapes through the Worker's ASSETS binding (never a self-fetch). */
export async function loadShapes(): Promise<Shapes | null> {
  const G = globalThis as unknown as { __roam_og_shapes?: Promise<Shapes | null> };
  if (!G.__roam_og_shapes) {
    G.__roam_og_shapes = (async () => {
      type Env = { ASSETS?: { fetch: (r: Request) => Promise<Response> } };
      let env: Env = {};
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore runtime module of workerd, no types in this project
        const mod = (await import(/* @vite-ignore */ "cloudflare:workers")) as { env?: Env };
        env = mod?.env ?? {};
      } catch {
        // not on workerd
      }
      if (!env.ASSETS) {
        try {
          const { getWorkerEnv } = await import("./worker-env");
          env = (getWorkerEnv() ?? {}) as Env;
        } catch {
          env = {};
        }
      }
      if (!env.ASSETS) return null;
      const res = await env.ASSETS.fetch(new Request("https://assets.local/gtfs-shapes.json"));
      return res.ok ? ((await res.json()) as Shapes) : null;
    })().catch(() => null);
  }
  const s = await G.__roam_og_shapes;
  if (!s) delete G.__roam_og_shapes;
  return s;
}

// ------------------------------------------------------------------ map

export type View = { lat: number; lng: number; /** metres per pixel */ mpp: number };
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** A view that fits the points inside a box of the card. */
export function fitView(pts: LatLng[], box: Box, minMpp = 2.2): View {
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const wm = (Math.max(...lngs) - Math.min(...lngs)) * kx;
  const hm = (Math.max(...lats) - Math.min(...lats)) * 110540;
  const mpp = Math.max(minMpp, wm / (box.x1 - box.x0), hm / (box.y1 - box.y0));
  return { lat, lng, mpp };
}

/** Project so that the view centre lands on (cx, cy). */
export function projector(v: View, cx: number, cy: number) {
  const kx = (111320 * Math.cos((v.lat * Math.PI) / 180)) / v.mpp;
  const ky = 110540 / v.mpp;
  return (p: LatLng) => ({ x: cx + (p.lng - v.lng) * kx, y: cy - (p.lat - v.lat) * ky });
}

type Proj = ReturnType<typeof projector>;

function pathD(pts: { x: number; y: number }[]): string {
  let d = "";
  let last: { x: number; y: number } | null = null;
  for (const p of pts) {
    if (last && Math.abs(p.x - last.x) < 1.2 && Math.abs(p.y - last.y) < 1.2) continue;
    d += `${d ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    last = p;
  }
  return d;
}

/**
 * The aerial base: canvas grey, every route in view drawn as a pale road with
 * a soft edge (the network itself reads as the street map), faint stop dots.
 */
export function baseMap(proj: Proj, shapes: Shapes | null, v: View): string {
  const inView = (p: { x: number; y: number }) =>
    p.x > -200 && p.x < W + 200 && p.y > -200 && p.y < H + 200;
  const roads: string[] = [];
  // View bounds in degrees, with a margin, to skip routes far off the card.
  const kx = 111320 * Math.cos((v.lat * Math.PI) / 180);
  const dLng = ((W + 400) * v.mpp) / kx;
  const dLat = ((H + 400) * v.mpp) / 110540;
  const seen = new Set<string>();
  for (const r of ROUTES) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const c = cachedPaths(r.id, shapes);
    const b = c.box;
    if (
      !b ||
      b[2] < v.lat - dLat ||
      b[0] > v.lat + dLat ||
      b[3] < v.lng - dLng ||
      b[1] > v.lng + dLng
    )
      continue;
    for (const path of c.paths) {
      const pts = path.map(proj);
      if (!pts.some(inView)) continue;
      roads.push(pathD(pts));
    }
  }
  const width = Math.max(5, Math.min(16, 26 / Math.sqrt(v.mpp)));
  const dots: string[] = [];
  if (v.mpp < 9) {
    for (const s of STOPS) {
      const p = proj(s);
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
      dots.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6"/>`);
    }
  }
  const d = roads.join("");
  return `<rect width="${W}" height="${H}" fill="${R.canvas}"/>
<path d="${d}" fill="none" stroke="${R.streetEdge}" stroke-width="${(width + 3).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${R.street}" stroke-width="${width.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>
<g fill="#b9b9b3">${dots.join("")}</g>`;
}

/** A featured route: ink path with a white casing, optional ring stops. */
export function featuredRoute(
  proj: Proj,
  paths: LatLng[][],
  stops: LatLng[],
  rings = true,
  color: string = R.ink,
): string {
  const d = paths.map((p) => pathD(p.map(proj))).join("");
  // Pale feed colours (light green, yellow) get ink rings so stops still read.
  const ringInk = lum(color) > 0.45 ? R.ink : color;
  const ring = rings
    ? stops
        .map((s) => {
          const p = proj(s);
          return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5.5" fill="${R.white}" stroke="${ringInk}" stroke-width="3"/>`;
        })
        .join("")
    : "";
  return `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.16" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${R.white}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>${ring}`;
}

/** Simple front-view bus glyph centred on (x, y). */
export function busGlyph(x: number, y: number, s: number, fill: string): string {
  const w = s * 0.78;
  const h = s;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const f = (n: number) => n.toFixed(1);
  return `<g fill="${fill}">
<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h * 0.86)}" rx="${f(s * 0.16)}"/>
<rect x="${f(x0 + w * 0.12)}" y="${f(y0 + h * 0.8)}" width="${f(w * 0.18)}" height="${f(h * 0.2)}" rx="${f(s * 0.05)}"/>
<rect x="${f(x0 + w * 0.7)}" y="${f(y0 + h * 0.8)}" width="${f(w * 0.18)}" height="${f(h * 0.2)}" rx="${f(s * 0.05)}"/>
</g>
<rect x="${f(x0 + w * 0.13)}" y="${f(y0 + h * 0.14)}" width="${f(w * 0.74)}" height="${f(h * 0.34)}" rx="${f(s * 0.06)}" fill="${R.y}"/>
<circle cx="${f(x0 + w * 0.26)}" cy="${f(y0 + h * 0.66)}" r="${f(s * 0.07)}" fill="${R.y}"/>
<circle cx="${f(x0 + w * 0.74)}" cy="${f(y0 + h * 0.66)}" r="${f(s * 0.07)}" fill="${R.y}"/>`;
}

/** Roam stop marker: the ink signpost pin with a white stop sign, tip on (x, y). */
export function stopMarker(x: number, y: number, size = 64): string {
  const k = size / 28;
  const f = (n: number) => n.toFixed(1);
  const body = "M14 35c-1-3.5-12-12-12-21a12 12 0 0 1 24 0c0 9-11 17.5-12 21z";
  return `<g transform="translate(${f(x - 14 * k)} ${f(y - 35 * k)}) scale(${k.toFixed(3)})">
<ellipse cx="14" cy="35.4" rx="4.5" ry="1.4" fill="#000" opacity="0.22"/>
<path d="${body}" transform="translate(0 1.6)" fill="#000" opacity="0.2"/>
<path d="${body}" fill="${R.ink}" stroke="${R.white}" stroke-width="2" stroke-linejoin="round"/>
<g transform="translate(5.5 4.2) scale(0.95)">
<rect x="4" y="1.5" width="10" height="8" rx="2.2" fill="${R.white}"/>
<rect x="8.1" y="9" width="1.8" height="7" rx="0.9" fill="${R.white}"/>
<rect x="6.2" y="4.6" width="5.6" height="1.8" rx="0.9" fill="${R.ink}"/>
</g>
</g>`;
}

/** Start-of-line pin: ink disc with a white core. */
export function endPin(x: number, y: number): string {
  const f = (n: number) => n.toFixed(1);
  return `<circle cx="${f(x)}" cy="${f(y)}" r="13" fill="${R.ink}" stroke="${R.white}" stroke-width="4"/><circle cx="${f(x)}" cy="${f(y)}" r="4.5" fill="${R.white}"/>`;
}

// ------------------------------------------------------------------ card chrome

/** Aloya brand: the real app icon (public/icon-512.png), then the wordmark. */
export function brand(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
<clipPath id="aloya-logo-clip"><rect width="48" height="48" rx="13"/></clipPath>
<rect x="-1" y="-1" width="50" height="50" rx="14" fill="#000" opacity="0.06"/>
<image href="data:image/png;base64,${ALOYA_LOGO_PNG_B64}" x="0" y="0" width="48" height="48" clip-path="url(#aloya-logo-clip)" preserveAspectRatio="xMidYMid slice"/>
${text(62, 35, "Aloya", { size: 31, weight: 800, fill: R.ink, track: -0.4 })}
</g>`;
}

/** The white card on the left, with a soft shadow. */
export function panel(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x}" y="${y + 10}" width="${w}" height="${h}" rx="40" fill="#000" opacity="0.10"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="${R.white}"/>`;
}

/** Eyebrow label, sentence case (Roam copy rule: no shouting caps). */
export function eyebrow(x: number, y: number, s: string, fill: string = R.mute): string {
  return text(x, y, plain(s), { size: 21, weight: 700, fill, track: 0.2 });
}

/** A filled pill with centred text; returns the svg and its width. */
export function pill(
  x: number,
  y: number,
  s: string,
  o: {
    fill?: string;
    color?: string;
    size?: number;
    h?: number;
    padX?: number;
    weight?: number;
  } = {},
): { svg: string; w: number } {
  const size = o.size ?? 24;
  const h = o.h ?? 48;
  const padX = o.padX ?? 20;
  const weight = o.weight ?? 700;
  const w = Math.round(textWidth(s, size, weight) + padX * 2);
  return {
    w,
    svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${o.fill ?? R.ink}"/>${text(x + w / 2, y + h / 2 + size * 0.35, s, { size, weight, fill: o.color ?? R.white, anchor: "middle" })}`,
  };
}

/** Line-number pills in one row; the rest collapse into "+N". */
export function pillRow(
  x: number,
  y: number,
  codes: string[],
  maxW: number,
  colors: (string | undefined)[] = [],
): string {
  const opt = { size: 22, h: 44, padX: 16 };
  const gap = 10;
  const widths = codes.map((c) => pill(0, 0, c, opt).w);
  let fit = codes.length;
  for (;;) {
    const rest = codes.length - fit;
    let total = widths.slice(0, fit).reduce((a, b) => a + b, 0) + gap * Math.max(0, fit - 1);
    if (rest > 0) total += gap + pill(0, 0, `+${rest}`, opt).w;
    if (total <= maxW || fit === 0) break;
    fit--;
  }
  let cx = x;
  let out = "";
  for (let i = 0; i < fit; i++) {
    const f = colors[i] ?? R.ink;
    out += pill(cx, y, codes[i], { ...opt, fill: f, color: onColor(f) }).svg;
    cx += widths[i] + gap;
  }
  if (fit < codes.length)
    out += pill(cx, y, `+${codes.length - fit}`, { ...opt, fill: R.pill, color: R.ink }).svg;
  return out;
}

export function svgDoc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

// ------------------------------------------------------------------ raster

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let FONTS: Uint8Array[] | null = null;
function fonts(): Uint8Array[] {
  if (!FONTS) {
    const f = payload as Record<string, string>;
    FONTS = ["URBANIST_MEDIUM_B64", "URBANIST_SEMIBOLD_B64", "URBANIST_EXTRABOLD_B64"].map((k) =>
      b64ToBytes(f[k]),
    );
  }
  return FONTS;
}

const RESVG_WASM_URL = "https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
function ensureWasm(): Promise<void> {
  const G = globalThis as unknown as { __aloya_resvg_ready?: Promise<void> };
  if (!G.__aloya_resvg_ready) {
    G.__aloya_resvg_ready = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore bundled as a CompiledWasm module by wrangler
        const mod = await import(/* @vite-ignore */ "@resvg/resvg-wasm/index_bg.wasm");
        await initWasm(mod.default as WebAssembly.Module);
      } catch (e) {
        if (String((e as Error)?.message || e).includes("Already initialized")) return;
        await initWasm(fetch(RESVG_WASM_URL));
      }
    })().catch((e) => {
      if (String(e?.message || e).includes("Already initialized")) return;
      throw e;
    });
  }
  return G.__aloya_resvg_ready;
}

/** Render a Roam card SVG to PNG bytes. */
export async function renderPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    background: R.canvas,
    font: {
      fontBuffers: fonts(),
      loadSystemFonts: false,
      defaultFontFamily: FONT,
      sansSerifFamily: FONT,
    },
    textRendering: 2,
    shapeRendering: 2,
  });
  return resvg.render().asPng();
}

/** PNG response with crawler-friendly headers. */
export async function pngResponse(svg: string, cacheSeconds = 300): Promise<Response> {
  const png = await renderPng(svg);
  return new Response(png as BlobPart, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=600`,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
