// Roam share cards: one composition per shared page. Each returns an SVG
// string for og-roam.server.ts to rasterise. Inputs are real data only; when
// something is unknown the card says less rather than guessing.

import { getRoute, getStop } from "@/lib/gtfs";
import {
  H,
  NETWORK,
  R,
  W,
  baseMap,
  brand,
  endPin,
  eyebrow,
  featuredRoute,
  fitView,
  linesAtStop,
  panel,
  pill,
  pillRow,
  plain,
  projector,
  routePaths,
  routeStopList,
  runsBetween,
  stopMarker,
  svgDoc,
  text,
  wrap,
  type LatLng,
  type Shapes,
  type View,
} from "@/lib/og-roam.server";

// Card geometry: the white panel on the left, the map shows on the right.
const PX = 40;
const PY = 40;
const PW = 560;
const PH = H - 80;
const IN = PX + 44; // text inset
const TW = PW - 88; // text width
const MAP_BOX = { x0: PX + PW + 50, y0: 60, x1: W - 50, y1: H - 60 };
const MAP_CX = (MAP_BOX.x0 + MAP_BOX.x1) / 2;
const MAP_CY = H / 2;

/** Solomos Square, Nicosia's central bus station. */
const SOLOMOS = { lat: 35.16955, lng: 33.36085 };

function titleBlock(y: number, title: string, size = 60, maxLines = 2): { svg: string; bottom: number } {
  let s = size;
  let lines = wrap(title, s, TW, maxLines, 800);
  // Shrink a long name before it is cut.
  while (s > 40 && lines.some((l) => l.endsWith("\u2026"))) {
    s -= 4;
    lines = wrap(title, s, TW, maxLines, 800);
  }
  const lh = Math.round(s * 1.08);
  const svg = lines.map((l, i) => text(IN, y + i * lh, l, { size: s, weight: 800, track: -1 })).join("");
  return { svg, bottom: y + (lines.length - 1) * lh };
}

function paragraph(y: number, s: string, size = 26, max = 2, fill: string = R.ink2): { svg: string; bottom: number } {
  const lines = wrap(s, size, TW, max, 600);
  const lh = Math.round(size * 1.3);
  return {
    svg: lines.map((l, i) => text(IN, y + i * lh, l, { size, weight: 600, fill })).join(""),
    bottom: y + (lines.length - 1) * lh,
  };
}

function footer(label: string): string {
  return text(IN, PY + PH - 40, plain(label), { size: 20, weight: 600, fill: R.mute });
}

function frame(map: string, card: string): string {
  return svgDoc(`${map}${panel(PX, PY, PW, PH)}${card}`);
}

const at = (p: LatLng, mpp: number): View => ({ lat: p.lat, lng: p.lng, mpp });

// ------------------------------------------------------------------ default

export function defaultCard(shapes: Shapes | null): string {
  const v = at(SOLOMOS, 6.5);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(SOLOMOS);
  const map = baseMap(proj, shapes, v) + stopMarker(c.x, c.y, 60);
  const t = titleBlock(PY + 206, "Your next bus, live on the map", 60, 3);
  const p = paragraph(t.bottom + 54, "Live arrivals, trip plans and group trips on every bus line in Cyprus.");
  const y = p.bottom + 32;
  const a = pill(IN, y, `${NETWORK.lines} lines`, { fill: R.y, color: R.ink });
  const b = pill(IN + a.w + 12, y, `${NETWORK.stops.toLocaleString("en-GB")} stops`, { fill: R.pill, color: R.ink });
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, "Buses across Cyprus")}${t.svg}${p.svg}${a.svg}${b.svg}${footer("aloya.cy")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ stop

export function stopCard(stopId: string | null, shapes: Shapes | null): string {
  const s = stopId ? getStop(stopId) : undefined;
  if (!s) return defaultCard(shapes);
  const { codes, routeIds } = linesAtStop(s.id);
  const v = at(s, 3.4);
  const proj = projector(v, MAP_CX, MAP_CY);
  const feat = routeIds.slice(0, 8).flatMap((rid) => routePaths(rid, shapes));
  const c = proj(s);
  const map = baseMap(proj, shapes, v) + featuredRoute(proj, feat, [], false) + stopMarker(c.x, c.y, 68);
  const t = titleBlock(PY + 206, s.name, 58, 3);
  let y = t.bottom + 58;
  const n = codes.length;
  const sub = text(IN, y, n ? `${n} ${n === 1 ? "line stops" : "lines stop"} here` : "Live arrivals for this stop", {
    size: 28,
    weight: 600,
    fill: R.ink2,
  });
  y += 26;
  const pills = n ? pillRow(IN, y, codes, TW) : "";
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, s.code ? `Bus stop ${s.code}` : "Bus stop")}${t.svg}${sub}${pills}${footer("Live arrivals on Aloya")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ line

function lineMap(routeId: string, shapes: Shapes | null) {
  const paths = routePaths(routeId, shapes);
  const stops = routeStopList(routeId);
  const pts = paths.flat().concat(stops);
  if (!pts.length) return null;
  const v = fitView(pts, { x0: MAP_BOX.x0 + 20, x1: MAP_BOX.x1 - 20, y0: MAP_BOX.y0 + 20, y1: MAP_BOX.y1 - 20 }, 2.4);
  const proj = projector(v, MAP_CX, MAP_CY);
  const first = stops[0];
  const last = stops[stops.length - 1];
  let svg = baseMap(proj, shapes, v) + featuredRoute(proj, paths, stops.length <= 70 ? stops : [], true);
  if (first) {
    const p = proj(first);
    svg += endPin(p.x, p.y);
  }
  if (last && last !== first) {
    const p = proj(last);
    svg += stopMarker(p.x, p.y, 52);
  }
  return { svg, stops };
}

export function lineCard(routeId: string | null, shapes: Shapes | null, kicker?: string): string {
  const r = routeId ? getRoute(routeId) : undefined;
  if (!r) return defaultCard(shapes);
  const m = lineMap(r.id, shapes);
  if (!m) return defaultCard(shapes);
  const { from, to } = runsBetween(r.long);
  const code = pill(IN, PY + 172, r.short, { fill: R.y, color: R.ink, size: 44, h: 76, padX: 26, weight: 800 });
  const t = titleBlock(PY + 336, to || from, 52, 2);
  let y = t.bottom + 48;
  const fromSvg = to ? text(IN, y, wrap(`From ${from}`, 26, TW, 1, 600)[0], { size: 26, weight: 600, fill: R.ink2 }) : "";
  y += 24;
  const stat = m.stops.length
    ? pill(IN, y, `${m.stops.length} stops`, { fill: R.pill, color: R.ink, size: 22, h: 44, padX: 18 }).svg
    : "";
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, kicker ?? "Bus line")}${code.svg}${eyebrow(IN, PY + 290, "Towards")}${t.svg}${fromSvg}${stat}${footer(kicker ? "Follow along live on Aloya" : "Live buses on Aloya")}`;
  return frame(m.svg, card);
}

// ------------------------------------------------------------------ trip

export function tripCard(routeId: string | null, shapes: Shapes | null): string {
  if (routeId && getRoute(routeId)) return lineCard(routeId, shapes, "Live trip");
  const v = at(SOLOMOS, 4.2);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(SOLOMOS);
  const map = baseMap(proj, shapes, v) + stopMarker(c.x, c.y, 60);
  const t = titleBlock(PY + 206, "Follow this trip live", 60, 2);
  const p = paragraph(t.bottom + 54, "See the bus move, the stops still to go and when it gets in.");
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, "Live trip")}${t.svg}${p.svg}${footer("aloya.cy")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ group

export type GroupOg = {
  code: string | null;
  destination: string | null;
  host: string | null;
  members: number;
  arrived: number;
  nextEta: number | null;
  /** Where members are, when known (their last pings). */
  points?: LatLng[];
};

export function groupCard(g: GroupOg, shapes: Shapes | null): string {
  const pts = (g.points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const v =
    pts.length >= 2
      ? fitView(pts, { x0: MAP_BOX.x0 + 60, x1: MAP_BOX.x1 - 60, y0: MAP_BOX.y0 + 60, y1: MAP_BOX.y1 - 60 }, 2.6)
      : at(pts[0] ?? SOLOMOS, 4.2);
  const proj = projector(v, MAP_CX, MAP_CY);
  let map = baseMap(proj, shapes, v);
  for (const p of pts.slice(0, 8)) {
    const q = proj(p);
    map += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="22" fill="${R.ink}" stroke="${R.white}" stroke-width="5"/><circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="8" fill="${R.y}"/>`;
  }
  const t = titleBlock(PY + 240, g.destination || "A group trip", 58, 2);
  let y = t.bottom + 48;
  const host = g.host ? wrap(`Hosted by ${g.host}`, 26, TW, 1, 600)[0] : "Join and watch each other arrive";
  const hostSvg = text(IN, y, host, { size: 26, weight: 600, fill: R.ink2 });
  y += 30;
  const tileH = 112;
  const tileW = (TW - 14) / 2;
  const eta = g.nextEta != null ? `${g.nextEta} min` : g.members ? "Live" : "Open";
  const etaSub = g.nextEta != null ? "next arrival" : g.members ? "positions updating" : "be the first to join";
  const peopleSub = g.arrived ? `${g.arrived} arrived` : g.members === 1 ? "person on the way" : "people on the way";
  const tiles = `<rect x="${IN}" y="${y}" width="${tileW}" height="${tileH}" rx="28" fill="${R.y}"/>
${text(IN + 24, y + 58, eta, { size: 44, weight: 800 })}${text(IN + 24, y + 90, etaSub, { size: 20, weight: 600 })}
<rect x="${IN + tileW + 14}" y="${y}" width="${tileW}" height="${tileH}" rx="28" fill="${R.pill}"/>
${text(IN + tileW + 38, y + 58, String(g.members), { size: 44, weight: 800 })}${text(IN + tileW + 38, y + 90, peopleSub, { size: 20, weight: 600, fill: R.ink2 })}`;
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, g.code ? `Group trip ${g.code}` : "Group trip")}${eyebrow(IN, PY + 186, "Meeting at", R.ink2)}${t.svg}${hostSvg}${tiles}${footer("Watch together on Aloya")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ plan

export type PlanLegOg = { kind: string; routeId?: string; routeShort?: string; from?: LatLng; to?: LatLng };
export type PlanOg = {
  origin: string | null;
  destination: string | null;
  creator: string | null;
  depart: string | null; // "08:42"
  arrive: string | null; // "09:10"
  day: string | null; // "Sat 31 Oct"
  duration: string | null; // "28 min"
  transfers: number;
  legs: PlanLegOg[];
};

/** The slice of a route path between the points nearest to a and b. */
function slicePath(path: LatLng[], a: LatLng, b: LatLng): LatLng[] {
  const near = (p: LatLng) => {
    let bi = 0;
    let bd = Infinity;
    path.forEach((q, i) => {
      const d = (q.lat - p.lat) ** 2 + (q.lng - p.lng) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return { i: bi, d: bd };
  };
  const ia = near(a);
  const ib = near(b);
  // More than ~400 m off this path, or the wrong direction: not this shape.
  if (ia.d > 1.6e-5 || ib.d > 1.6e-5 || ia.i >= ib.i) return [];
  return path.slice(ia.i, ib.i + 1);
}

export function planCard(p: PlanOg, shapes: Shapes | null): string {
  const legPts = p.legs
    .flatMap((l) => [l.from, l.to])
    .filter((x): x is LatLng => !!x && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  let map: string;
  if (legPts.length >= 2) {
    const v = fitView(legPts, { x0: MAP_BOX.x0 + 50, x1: MAP_BOX.x1 - 50, y0: MAP_BOX.y0 + 50, y1: MAP_BOX.y1 - 50 }, 2.2);
    const proj = projector(v, MAP_CX, MAP_CY);
    map = baseMap(proj, shapes, v);
    for (const l of p.legs) {
      if (!l.from || !l.to) continue;
      const a = proj(l.from);
      const b = proj(l.to);
      if (l.kind === "walk") {
        map += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${R.ink}" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 14"/>`;
        continue;
      }
      let seg: LatLng[] = [];
      if (l.routeId) {
        for (const path of routePaths(l.routeId, shapes)) {
          seg = slicePath(path, l.from, l.to);
          if (seg.length > 1) break;
        }
      }
      map += featuredRoute(proj, [seg.length > 1 ? seg : [l.from, l.to]], [l.from, l.to], true);
    }
    const o = proj(legPts[0]);
    const d = proj(legPts[legPts.length - 1]);
    map += endPin(o.x, o.y) + stopMarker(d.x, d.y, 56);
  } else {
    const v = at(SOLOMOS, 4.2);
    map = baseMap(projector(v, MAP_CX, MAP_CY), shapes, v);
  }
  const t = titleBlock(PY + 240, p.destination || "A trip plan", 54, 2);
  let y = t.bottom + 46;
  const fromSvg = p.origin
    ? text(IN, y, wrap(`From ${p.origin}`, 26, TW, 1, 600)[0], { size: 26, weight: 600, fill: R.ink2 })
    : "";
  y += 28;
  let tiles = "";
  if (p.arrive || p.depart) {
    const tileH = 112;
    const big = p.arrive ?? p.depart ?? "";
    const small = p.arrive ? (p.depart ? `arrive, leave ${p.depart}` : "arrive") : "leave";
    tiles += `<rect x="${IN}" y="${y}" width="${TW}" height="${tileH}" rx="28" fill="${R.y}"/>${text(IN + 26, y + 60, big, { size: 48, weight: 800 })}${text(IN + 26, y + 92, small, { size: 20, weight: 600 })}`;
    const opt = { size: 22, h: 44, padX: 16 };
    const lines = [...new Set(p.legs.map((l) => l.routeShort).filter((s): s is string => !!s))];
    let px = IN + TW - 24;
    if (p.duration) {
      const w = pill(0, 0, p.duration, opt).w;
      px -= w;
      tiles += pill(px, y + 34, p.duration, { ...opt, fill: R.ink, color: R.white }).svg;
      px -= 10;
    }
    for (const code of lines.slice(0, 2).reverse()) {
      const w = pill(0, 0, code, opt).w;
      if (px - w < IN + 240) break;
      px -= w;
      tiles += pill(px, y + 34, code, { ...opt, fill: R.white, color: R.ink }).svg;
      px -= 10;
    }
  }
  const kicker = p.creator ? `Shared by ${p.creator}` : "Shared trip plan";
  const foot = [p.day, p.transfers ? `${p.transfers} ${p.transfers === 1 ? "change" : "changes"}` : "Direct"]
    .filter(Boolean)
    .join(" \u00b7 ");
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, wrap(kicker, 18, TW, 1, 600)[0])}${eyebrow(IN, PY + 186, "Going to", R.ink2)}${t.svg}${fromSvg}${tiles}${footer(foot)}`;
  return frame(map, card);
}
