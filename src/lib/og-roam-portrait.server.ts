// Roam share cards, portrait (4:5, 1080 x 1350 PNG): the picture the in-app
// share sheet sends. Same design language as the link previews in
// og-roam-cards.server.ts (real network map, signpost pin, feed line colours,
// the real Aloya icon plus the word in Urbanist, sentence case, no dashes),
// laid out as a map on top and a white card below.
//
// Drawn in an 864 x 1080 design space and rasterised at 1080 x 1350, so the
// shared helpers (sized for the 1200 x 630 cards) read 1.25x larger on a phone.

import { getRoute, getStop } from "@/lib/gtfs";
import {
  R,
  baseMap,
  brand,
  endPin,
  featuredRoute,
  fitView,
  linesAtStop,
  onColor,
  pill,
  pillRow,
  plain,
  projector,
  routeColor,
  routePaths,
  routeStopList,
  runsBetween,
  stopMarker,
  text,
  textWidth,
  wrap,
  type LatLng,
  type Shapes,
  type View,
} from "@/lib/og-roam.server";
import type { GroupOg, PlanOg, TripOg } from "@/lib/og-roam-cards.server";

/** Output size in pixels. */
export const OUT_W = 1080;
export const OUT_H = 1350;
/** Design space. */
const VW = 864;
const VH = 1080;
const SIZE = { w: VW, h: VH };

const M = 32; // outer margin
const PX = M;
const PWID = VW - 2 * M;
const IN = PX + 44; // text inset
const TW = PWID - 88; // text width
const PANEL_BOTTOM = VH - M;

const SOLOMOS = { lat: 35.16955, lng: 33.36085 };

type Block = { h: number; draw: (y: number) => string };

const gap = (h: number): Block => ({ h, draw: () => "" });

function brandBlock(): Block {
  return { h: 48, draw: (y) => brand(IN, y) };
}

function label(s: string, fill: string = R.mute, size = 22): Block {
  const line = wrap(plain(s), size, TW, 1, 700)[0] ?? "";
  return { h: size + 6, draw: (y) => text(IN, y + size * 0.86, line, { size, weight: 700, fill }) };
}

/**
 * A title that is never cut: shrink until it fits on two lines, and only when
 * the smallest size still needs more, let it run to a third (or fourth) line.
 */
function title(s: string, start = 62, min = 42): Block {
  const t = plain(s);
  let size = start;
  let lines = wrap(t, size, TW - 24, 2, 800);
  while (size > min && lines.some((l) => l.endsWith("\u2026"))) {
    size -= 2;
    lines = wrap(t, size, TW - 24, 2, 800);
  }
  if (lines.some((l) => l.endsWith("\u2026"))) lines = wrap(t, size, TW - 24, 4, 800);
  // A little smaller beats one short word alone on the second line.
  if (lines.length === 2) {
    for (let k = size - 2; k >= Math.max(min, size - 8); k -= 2) {
      const alt = wrap(t, k, TW - 24, 1, 800);
      if (alt.length === 1 && !alt[0].endsWith("\u2026")) {
        lines = alt;
        size = k;
        break;
      }
    }
  }
  const lh = Math.round(size * 1.08);
  return {
    h: lh * (lines.length - 1) + Math.round(size * 0.86),
    draw: (y) =>
      lines
        .map((l, i) =>
          text(IN, y + Math.round(size * 0.82) + i * lh, l, { size, weight: 800, track: -1 }),
        )
        .join(""),
  };
}

function para(s: string, size = 25, max = 2, fill: string = R.ink2): Block {
  const lines = wrap(plain(s), size, TW - 24, max, 600);
  const lh = Math.round(size * 1.3);
  return {
    h: lh * (lines.length - 1) + Math.round(size * 0.9),
    draw: (y) =>
      lines
        .map((l, i) => text(IN, y + Math.round(size * 0.82) + i * lh, l, { size, weight: 600, fill }))
        .join(""),
  };
}

function pillsBlock(codes: string[], colors: (string | undefined)[]): Block {
  return { h: 44, draw: (y) => pillRow(IN, y, codes, TW, colors) };
}

/** The shared link, as it reads in a browser bar (no scheme). */
function linkBlock(link: string): Block {
  const size = 21;
  let s = link.replace(/^https?:\/\//, "");
  // The width estimate runs short on long mixed-case tokens: keep a wide margin,
  // and fall back to the host alone rather than run off the card.
  if (textWidth(s, size, 600) > TW - 90) s = s.split("/")[0];
  return { h: 26, draw: (y) => text(IN, y + 20, s, { size, weight: 600, fill: R.mute }) };
}

function stack(blocks: Block[], padTop = 44, padBottom = 44): { h: number; draw: (y: number) => string } {
  const h = padTop + blocks.reduce((a, b) => a + b.h, 0) + padBottom;
  return {
    h,
    draw: (top) => {
      let y = top + padTop;
      let out = "";
      for (const b of blocks) {
        out += b.draw(y);
        y += b.h;
      }
      return out;
    },
  };
}

function panelSvg(top: number): string {
  const h = PANEL_BOTTOM - top;
  return `<rect x="${PX}" y="${top + 10}" width="${PWID}" height="${h}" rx="40" fill="#000" opacity="0.10"/>
<rect x="${PX}" y="${top}" width="${PWID}" height="${h}" rx="40" fill="${R.white}"/>`;
}

function doc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${VW} ${VH}">${body}</svg>`;
}

/** Compose: map above, the white card anchored to the bottom. */
function compose(blocks: Block[], map: (panelTop: number) => string): string {
  const s = stack(blocks);
  const top = Math.max(300, PANEL_BOTTOM - s.h);
  return doc(`${map(top)}${panelSvg(top)}${s.draw(top)}`);
}

/** Map area above the panel (a little of it runs under the card's top edge). */
function mapArea(top: number) {
  return { x0: 40, x1: VW - 40, y0: 40, y1: top - 36, cx: VW / 2, cy: (top - 8) / 2 };
}

const at = (p: LatLng, mpp: number): View => ({ lat: p.lat, lng: p.lng, mpp });

function lineColours(routeIds: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const rid of routeIds) {
    const r = getRoute(rid);
    if (r && !m.has(r.short)) m.set(r.short, routeColor(rid));
  }
  return m;
}

// ------------------------------------------------------------------ stop

export type NextBus = {
  routeId: string;
  /** Minutes until it comes, as the stop page shows it. */
  minutes: number;
  /** Clock time "16:20" (Cyprus), used when it is more than an hour away. */
  clock?: string | null;
  headsign?: string | null;
};

function nextBusBlock(n: NextBus): Block {
  const r = getRoute(n.routeId);
  const code = r?.short || n.routeId;
  const lc = routeColor(n.routeId);
  const big = n.minutes <= 0 ? "Now" : n.minutes <= 60 ? `${n.minutes} min` : (n.clock ?? "");
  const h = 128;
  return {
    h,
    draw: (y) => {
      const bigW = textWidth(big, 50, 800);
      const p = pill(IN + 26, y + 62, code, {
        fill: lc,
        color: onColor(lc),
        size: 22,
        h: 42,
        padX: 16,
        weight: 800,
      });
      const room = TW - 26 - p.w - 14 - bigW - 50;
      const dest = n.headsign ? (wrap(n.headsign, 24, Math.max(80, room), 1, 600)[0] ?? "") : "";
      return `<rect x="${IN}" y="${y}" width="${TW}" height="${h}" rx="30" fill="${R.y}"/>
${text(IN + 26, y + 44, "Next bus", { size: 22, weight: 700, fill: R.ink })}
${p.svg}${dest ? text(IN + 26 + p.w + 14, y + 92, dest, { size: 24, weight: 600, fill: R.ink }) : ""}
${big ? text(IN + TW - 26, y + 84, big, { size: 50, weight: 800, fill: R.ink, anchor: "end", track: -1 }) : ""}`;
    },
  };
}

export function stopPortrait(
  stopId: string,
  shapes: Shapes | null,
  o: {
    link: string;
    next?: NextBus | null;
    name?: string;
    kicker?: string;
    mpp?: number;
    agency?: string;
  },
): string | null {
  const s = getStop(stopId, o.agency) ?? getStop(stopId);
  if (!s) return null;
  const { codes, routeIds } = linesAtStop(s.id, s.agency);
  const colorOf = lineColours(routeIds);
  const blocks: Block[] = [
    brandBlock(),
    gap(34),
    label(o.kicker ?? (s.code ? `Bus stop ${s.code}` : "Bus stop")),
    gap(16),
    title(o.name ?? s.name),
  ];
  if (codes.length) blocks.push(gap(26), pillsBlock(codes, codes.map((c) => colorOf.get(c))));
  if (o.next) blocks.push(gap(26), nextBusBlock(o.next));
  blocks.push(gap(30), linkBlock(o.link));
  return compose(blocks, (top) => {
    const a = mapArea(top);
    const v = at(s, o.mpp ?? 4.2);
    const tipY = a.cy + 40;
    const proj = projector(v, a.cx, tipY);
    const feat = routeIds
      .slice(0, 8)
      .reverse()
      .map((rid) => featuredRoute(proj, routePaths(rid, shapes), [], false, routeColor(rid)))
      .join("");
    return baseMap(proj, shapes, v, SIZE) + feat + stopMarker(a.cx, tipY, 72);
  });
}

// ------------------------------------------------------------------ line / trip

export function linePortrait(
  routeId: string,
  shapes: Shapes | null,
  o: { link: string; kicker?: string; trip?: TripOg },
): string | null {
  const r = getRoute(routeId);
  if (!r) return null;
  const paths = routePaths(r.id, shapes);
  const stops = routeStopList(r.id);
  const pts = paths.flat().concat(stops);
  if (!pts.length) return null;
  const names = runsBetween(r.long);
  const from = o.trip?.from || stops[0]?.name || names.from;
  const to = o.trip?.to || (stops.length > 1 ? stops[stops.length - 1].name : names.to);
  const lc = routeColor(r.id);
  const codeRow: Block = {
    h: 72,
    draw: (y) => {
      const code = pill(IN, y, r.short, {
        fill: lc,
        color: onColor(lc),
        size: 42,
        h: 72,
        padX: 26,
        weight: 800,
      });
      const stat = o.trip?.depart
        ? pill(IN + code.w + 14, y + 14, `Leaves ${o.trip.depart}`, {
            fill: R.y,
            color: R.ink,
            size: 22,
            h: 44,
            padX: 18,
            weight: 800,
          }).svg
        : stops.length
          ? pill(IN + code.w + 14, y + 14, `${stops.length} stops`, {
              fill: R.pill,
              color: R.ink,
              size: 22,
              h: 44,
              padX: 18,
            }).svg
          : "";
      return code.svg + stat;
    },
  };
  const blocks: Block[] = [
    brandBlock(),
    gap(34),
    label(o.kicker ?? "Bus line"),
    gap(18),
    codeRow,
    gap(30),
    label("Towards", R.ink2),
    gap(12),
    title(to || from, 54),
  ];
  if (to && from) blocks.push(gap(16), para(`From ${from}`, 25, 1));
  blocks.push(gap(30), linkBlock(o.link));
  return compose(blocks, (top) => {
    const a = mapArea(top);
    const v = fitView(pts, { x0: a.x0 + 20, x1: a.x1 - 20, y0: a.y0 + 30, y1: a.y1 - 10 }, 2.4);
    const proj = projector(v, a.cx, (a.y0 + a.y1) / 2 + 10);
    let svg =
      baseMap(proj, shapes, v, SIZE) +
      featuredRoute(proj, paths, stops.length <= 70 ? stops : [], true, lc);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (first) {
      const p = proj(first);
      svg += endPin(p.x, p.y);
    }
    if (last && last !== first) {
      const p = proj(last);
      svg += stopMarker(p.x, p.y, 56);
    }
    return svg;
  });
}

export function tripPortrait(
  routeId: string | null,
  shapes: Shapes | null,
  o: { link: string; trip?: TripOg },
): string | null {
  if (!routeId) return null;
  return linePortrait(routeId, shapes, { link: o.link, kicker: "Live trip", trip: o.trip });
}

// ------------------------------------------------------------------ group

export function groupPortrait(g: GroupOg, shapes: Shapes | null, o: { link: string }): string {
  const place =
    g.place && Number.isFinite(g.place.lat) && Number.isFinite(g.place.lng) ? g.place : null;
  const eta = g.nextEta != null ? `${g.nextEta} min` : g.members ? "Live" : "Open";
  const etaSub =
    g.nextEta != null ? "next arrival" : g.members ? "positions updating" : "be the first to join";
  const peopleSub = g.arrived
    ? `${g.arrived} arrived`
    : g.members === 1
      ? "person on the way"
      : "people on the way";
  const tiles: Block = {
    h: 112,
    draw: (y) => {
      const w = (TW - 14) / 2;
      return `<rect x="${IN}" y="${y}" width="${w}" height="112" rx="30" fill="${R.y}"/>
${text(IN + 24, y + 58, eta, { size: 44, weight: 800 })}${text(IN + 24, y + 90, etaSub, { size: 21, weight: 600 })}
<rect x="${IN + w + 14}" y="${y}" width="${w}" height="112" rx="30" fill="${R.pill}"/>
${text(IN + w + 38, y + 58, String(g.members), { size: 44, weight: 800 })}${text(IN + w + 38, y + 90, peopleSub, { size: 21, weight: 600, fill: R.ink2 })}`;
    },
  };
  const blocks: Block[] = [
    brandBlock(),
    gap(34),
    label(g.code ? `Group trip ${g.code}` : "Group trip"),
    gap(10),
    label("Meeting at", R.ink2),
    gap(14),
    title(g.destination || "A group trip", 56),
    gap(16),
    para(g.host ? `Hosted by ${g.host}` : "Join and watch each other arrive", 25, 1),
    gap(26),
    tiles,
    gap(30),
    linkBlock(o.link),
  ];
  return compose(blocks, (top) => {
    const a = mapArea(top);
    const v = at(place ?? SOLOMOS, place ? 4.6 : 4.2);
    const tipY = a.cy + 40;
    const proj = projector(v, a.cx, tipY);
    return baseMap(proj, shapes, v, SIZE) + (place ? stopMarker(a.cx, tipY, 68) : "");
  });
}

// ------------------------------------------------------------------ plan

type LegStop = { stopId?: string; lat?: number; lng?: number };
function legPoint(s: LegStop | undefined, agency?: string): LatLng | undefined {
  if (!s) return undefined;
  if (Number.isFinite(s.lat) && Number.isFinite(s.lng))
    return { lat: s.lat as number, lng: s.lng as number };
  const hit = s.stopId ? getStop(s.stopId, agency) : undefined;
  return hit ? { lat: hit.lat, lng: hit.lng } : undefined;
}

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
  if (ia.d > 1.6e-5 || ib.d > 1.6e-5 || ia.i >= ib.i) return [];
  return path.slice(ia.i, ib.i + 1);
}

export function planPortrait(plan: PlanOg, shapes: Shapes | null, o: { link: string }): string {
  const legs = plan.legs.map((l) => {
    const agency = l.routeId ? getRoute(l.routeId)?.agency : undefined;
    return {
      ...l,
      from: l.from ?? legPoint(l.board, agency),
      to: l.to ?? legPoint(l.alight, agency),
    };
  });
  const legPts = legs
    .flatMap((l) => [l.from, l.to])
    .filter((x): x is LatLng => !!x && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  const here = /^(your|current|my) location$/i.test((plan.origin ?? "").trim());
  const seen = new Set<string>();
  const lines: { code: string; color: string }[] = [];
  for (const l of legs) {
    if (!l.routeShort || seen.has(l.routeShort)) continue;
    seen.add(l.routeShort);
    lines.push({ code: l.routeShort, color: routeColor(l.routeId) });
  }
  const blocks: Block[] = [
    brandBlock(),
    gap(34),
    label(plan.creator ? `Shared by ${plan.creator}` : "Shared trip plan"),
    gap(10),
    label("Going to", R.ink2),
    gap(14),
    title(plan.destination || "A trip plan", 56),
  ];
  if (plan.origin && !here) blocks.push(gap(16), para(`From ${plan.origin}`, 25, 1));
  if (plan.arrive || plan.depart) {
    const big = plan.arrive ?? plan.depart ?? "";
    const small = plan.arrive ? (plan.depart ? `arrive, leave ${plan.depart}` : "arrive") : "leave";
    blocks.push(gap(26), {
      h: 112,
      draw: (y) => {
        let s = `<rect x="${IN}" y="${y}" width="${TW}" height="112" rx="30" fill="${R.y}"/>${text(IN + 26, y + 60, big, { size: 46, weight: 800 })}${text(IN + 26, y + 92, small, { size: 21, weight: 600 })}`;
        const opt = { size: 22, h: 44, padX: 16 };
        let px = IN + TW - 24;
        if (plan.duration) {
          const w = pill(0, 0, plan.duration, opt).w;
          px -= w;
          s += pill(px, y + 34, plan.duration, { ...opt, fill: R.ink, color: R.white }).svg;
          px -= 10;
        }
        const fit: { code: string; color: string; w: number }[] = [];
        let room = px - (IN + 250);
        for (const l of lines.slice(0, 3)) {
          const w = pill(0, 0, l.code, opt).w;
          if (w + 10 > room) break;
          room -= w + 10;
          fit.push({ ...l, w });
        }
        let lx = px - fit.reduce((acc, l) => acc + l.w + 10, 0) + 10;
        for (const l of fit) {
          s += pill(lx, y + 34, l.code, { ...opt, fill: l.color, color: onColor(l.color) }).svg;
          lx += l.w + 10;
        }
        return s;
      },
    });
  }
  const meta = [
    plan.day,
    plan.transfers ? `${plan.transfers} ${plan.transfers === 1 ? "change" : "changes"}` : "Direct",
  ]
    .filter(Boolean)
    .join(", ");
  blocks.push(gap(26), para(meta, 22, 1, R.ink2), gap(10), linkBlock(o.link));
  return compose(blocks, (top) => {
    const a = mapArea(top);
    if (legPts.length < 2) {
      const v = at(SOLOMOS, 4.2);
      return baseMap(projector(v, a.cx, a.cy), shapes, v, SIZE);
    }
    const box = { x0: a.x0 + 50, x1: a.x1 - 50, y0: a.y0 + 70, y1: a.y1 - 20 };
    const v = fitView(legPts, box, 2.2);
    const proj = projector(v, a.cx, (box.y0 + box.y1) / 2);
    let map = baseMap(proj, shapes, v, SIZE);
    for (const l of legs) {
      if (!l.from || !l.to) continue;
      const p = proj(l.from);
      const q = proj(l.to);
      if (l.kind === "walk") {
        map += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="${R.ink}" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 14"/>`;
        continue;
      }
      let seg: LatLng[] = [];
      if (l.routeId) {
        for (const path of routePaths(l.routeId, shapes)) {
          seg = slicePath(path, l.from, l.to);
          if (seg.length > 1) break;
        }
      }
      map += featuredRoute(
        proj,
        [seg.length > 1 ? seg : [l.from, l.to]],
        [l.from, l.to],
        true,
        routeColor(l.routeId),
      );
    }
    const s0 = proj(legPts[0]);
    const s1 = proj(legPts[legPts.length - 1]);
    return map + endPin(s0.x, s0.y) + stopMarker(s1.x, s1.y, 60);
  });
}
