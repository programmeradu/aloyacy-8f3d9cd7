// Roam share cards: one composition per shared page. Each returns an SVG
// string for og-roam.server.ts to rasterise. Inputs are real data only; when
// something is unknown the card says less rather than guessing.

import { ROUTES, getRoute, getStop } from "@/lib/gtfs";
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
  onColor,
  plain,
  projector,
  routeColor,
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

function titleBlock(
  y: number,
  title: string,
  size = 60,
  maxLines = 2,
): { svg: string; bottom: number } {
  let s = size;
  let lines = wrap(title, s, TW, maxLines, 800);
  // Shrink a long name before it is cut.
  while (s > 40 && lines.some((l) => l.endsWith("\u2026"))) {
    s -= 4;
    lines = wrap(title, s, TW, maxLines, 800);
  }
  // Avoid a widow: a little smaller is better than one short word alone.
  for (let t = s - 4; t >= s - 12 && lines.length > 1; t -= 4) {
    const alt = wrap(title, t, TW, maxLines, 800);
    if (alt.length < lines.length && !alt.some((l) => l.endsWith("\u2026"))) {
      lines = alt;
      s = t;
      break;
    }
  }
  const lh = Math.round(s * 1.08);
  const svg = lines
    .map((l, i) => text(IN, y + i * lh, l, { size: s, weight: 800, track: -1 }))
    .join("");
  return { svg, bottom: y + (lines.length - 1) * lh };
}

function paragraph(
  y: number,
  s: string,
  size = 26,
  max = 2,
  fill: string = R.ink2,
): { svg: string; bottom: number } {
  // The width estimate runs short on lowercase-heavy copy; keep a margin off the card edge.
  const lines = wrap(s, size, TW - 32, max, 600);
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
  const p = paragraph(
    t.bottom + 54,
    "Live arrivals, trip plans and group trips on every bus line in Cyprus.",
  );
  const y = p.bottom + 32;
  const a = pill(IN, y, `${NETWORK.lines} lines`, { fill: R.y, color: R.ink });
  const b = pill(IN + a.w + 12, y, `${NETWORK.stops.toLocaleString("en-GB")} stops`, {
    fill: R.pill,
    color: R.ink,
  });
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, "Buses across Cyprus")}${t.svg}${p.svg}${a.svg}${b.svg}${footer("aloya.cy")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ stop

/** One colour per line number: the first route found with that number. */
function lineColours(routeIds: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const rid of routeIds) {
    const r = getRoute(rid);
    if (r && !m.has(r.short)) m.set(r.short, routeColor(rid));
  }
  return m;
}

export function stopCard(stopId: string | null, shapes: Shapes | null): string {
  const s = stopId ? getStop(stopId) : undefined;
  if (!s) return defaultCard(shapes);
  const { codes, routeIds } = linesAtStop(s.id, s.agency);
  const v = at(s, 3.4);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(s);
  // Each line through the stop in its own feed colour.
  const feat = routeIds
    .slice(0, 8)
    .reverse()
    .map((rid) => featuredRoute(proj, routePaths(rid, shapes), [], false, routeColor(rid)))
    .join("");
  const map = baseMap(proj, shapes, v) + feat + stopMarker(c.x, c.y, 68);
  const colorOf = lineColours(routeIds);
  const t = titleBlock(PY + 206, s.name, 58, 3);
  let y = t.bottom + 58;
  const n = codes.length;
  const sub = text(
    IN,
    y,
    n ? `${n} ${n === 1 ? "line stops" : "lines stop"} here` : "Live arrivals for this stop",
    {
      size: 28,
      weight: 600,
      fill: R.ink2,
    },
  );
  y += 26;
  const pills = n ? pillRow(IN, y, codes, TW, codes.map((x) => colorOf.get(x))) : "";
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, s.code ? `Bus stop ${s.code}` : "Bus stop")}${t.svg}${sub}${pills}${footer("Live arrivals on Aloya")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ line

function lineMap(routeId: string, shapes: Shapes | null) {
  const paths = routePaths(routeId, shapes);
  const stops = routeStopList(routeId);
  const pts = paths.flat().concat(stops);
  if (!pts.length) return null;
  const v = fitView(
    pts,
    { x0: MAP_BOX.x0 + 20, x1: MAP_BOX.x1 - 20, y0: MAP_BOX.y0 + 20, y1: MAP_BOX.y1 - 20 },
    2.4,
  );
  const proj = projector(v, MAP_CX, MAP_CY);
  const first = stops[0];
  const last = stops[stops.length - 1];
  let svg =
    baseMap(proj, shapes, v) +
    featuredRoute(proj, paths, stops.length <= 70 ? stops : [], true, routeColor(routeId));
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

export type TripOg = {
  /** Departure from the first stop, "HH:MM" (Cyprus time). */
  depart?: string | null;
  from?: string | null;
  to?: string | null;
};

export function lineCard(
  routeId: string | null,
  shapes: Shapes | null,
  kicker?: string,
  trip?: TripOg,
): string {
  const r = routeId ? getRoute(routeId) : undefined;
  if (!r) return defaultCard(shapes);
  const m = lineMap(r.id, shapes);
  if (!m) return defaultCard(shapes);
  // Names from the first and last stops (the feed's long names are cut short).
  const names = runsBetween(r.long);
  const from = trip?.from || m.stops[0]?.name || names.from;
  const to = trip?.to || (m.stops.length > 1 ? m.stops[m.stops.length - 1].name : names.to);
  const lc = routeColor(r.id);
  const code = pill(IN, PY + 172, r.short, {
    fill: lc,
    color: onColor(lc),
    size: 44,
    h: 76,
    padX: 26,
    weight: 800,
  });
  const t = titleBlock(PY + 334, to || from, 48, 2);
  const y = t.bottom + 46;
  const fromSvg = to
    ? text(IN, y, wrap(`From ${from}`, 26, TW, 1, 600)[0], { size: 26, weight: 600, fill: R.ink2 })
    : "";
  // A trip shows when it leaves (yellow, the Roam accent); a line its stop count.
  const stat = trip?.depart
    ? pill(IN + code.w + 14, PY + 188, `Leaves ${trip.depart}`, {
        fill: R.y,
        color: R.ink,
        size: 22,
        h: 44,
        padX: 18,
        weight: 800,
      }).svg
    : m.stops.length
      ? pill(IN + code.w + 14, PY + 188, `${m.stops.length} stops`, {
          fill: R.pill,
          color: R.ink,
          size: 22,
          h: 44,
          padX: 18,
        }).svg
      : "";
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, kicker ?? "Bus line")}${code.svg}${eyebrow(IN, PY + 290, "Towards")}${t.svg}${fromSvg}${stat}${footer(kicker ? "Follow along live on Aloya" : "Live buses on Aloya")}`;
  return frame(m.svg, card);
}

// ------------------------------------------------------------------ trip

export function tripCard(routeId: string | null, shapes: Shapes | null, trip?: TripOg): string {
  if (routeId && getRoute(routeId)) return lineCard(routeId, shapes, "Live trip", trip);
  const v = at(SOLOMOS, 4.2);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(SOLOMOS);
  const map = baseMap(proj, shapes, v) + stopMarker(c.x, c.y, 60);
  const t = titleBlock(PY + 206, "Follow this trip live", 60, 2);
  const p = paragraph(
    t.bottom + 54,
    "See the bus move, the stops still to go and when it gets in.",
  );
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
  /** The meeting point. Member positions never go on a public image. */
  place?: LatLng | null;
};

export function groupCard(g: GroupOg, shapes: Shapes | null): string {
  const place =
    g.place && Number.isFinite(g.place.lat) && Number.isFinite(g.place.lng) ? g.place : null;
  const v = at(place ?? SOLOMOS, place ? 5 : 4.2);
  const proj = projector(v, MAP_CX, MAP_CY);
  let map = baseMap(proj, shapes, v);
  if (place) {
    const q = proj(place);
    map += stopMarker(q.x, q.y, 64);
  }
  const t = titleBlock(PY + 232, g.destination || "A group trip", 52, 2);
  let y = t.bottom + 46;
  const host = g.host
    ? wrap(`Hosted by ${g.host}`, 26, TW, 1, 600)[0]
    : "Join and watch each other arrive";
  const hostSvg = text(IN, y, host, { size: 26, weight: 600, fill: R.ink2 });
  y += 28;
  const tileH = 100;
  const tileW = (TW - 14) / 2;
  const eta = g.nextEta != null ? `${g.nextEta} min` : g.members ? "Live" : "Open";
  const etaSub =
    g.nextEta != null ? "next arrival" : g.members ? "positions updating" : "be the first to join";
  const peopleSub = g.arrived
    ? `${g.arrived} arrived`
    : g.members === 1
      ? "person on the way"
      : "people on the way";
  const tiles = `<rect x="${IN}" y="${y}" width="${tileW}" height="${tileH}" rx="28" fill="${R.y}"/>
${text(IN + 24, y + 52, eta, { size: 42, weight: 800 })}${text(IN + 24, y + 82, etaSub, { size: 20, weight: 600 })}
<rect x="${IN + tileW + 14}" y="${y}" width="${tileW}" height="${tileH}" rx="28" fill="${R.pill}"/>
${text(IN + tileW + 38, y + 52, String(g.members), { size: 42, weight: 800 })}${text(IN + tileW + 38, y + 82, peopleSub, { size: 20, weight: 600, fill: R.ink2 })}`;
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, g.code ? `Group trip ${g.code}` : "Group trip")}${eyebrow(IN, PY + 186, "Meeting at", R.ink2)}${t.svg}${hostSvg}${tiles}${footer("Watch together on Aloya")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ plan

export type PlanLegOg = {
  kind: string;
  routeId?: string;
  routeShort?: string;
  from?: LatLng;
  to?: LatLng;
  /** Bus legs of a trip option carry their stops as board/alight. */
  board?: LegStop;
  alight?: LegStop;
};
type LegStop = { stopId?: string; lat?: number; lng?: number };

function legPoint(s: LegStop | undefined, agency?: string): LatLng | undefined {
  if (!s) return undefined;
  if (Number.isFinite(s.lat) && Number.isFinite(s.lng))
    return { lat: s.lat as number, lng: s.lng as number };
  const hit = s.stopId ? getStop(s.stopId, agency) : undefined;
  return hit ? { lat: hit.lat, lng: hit.lng } : undefined;
}
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

export function planCard(plan: PlanOg, shapes: Shapes | null): string {
  const p = {
    ...plan,
    legs: plan.legs.map((l) => {
      const agency = l.routeId ? getRoute(l.routeId)?.agency : undefined;
      return {
        ...l,
        from: l.from ?? legPoint(l.board, agency),
        to: l.to ?? legPoint(l.alight, agency),
      };
    }),
  };
  const legPts = p.legs
    .flatMap((l) => [l.from, l.to])
    .filter((x): x is LatLng => !!x && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  let map: string;
  if (legPts.length >= 2) {
    const v = fitView(
      legPts,
      { x0: MAP_BOX.x0 + 50, x1: MAP_BOX.x1 - 50, y0: MAP_BOX.y0 + 50, y1: MAP_BOX.y1 - 50 },
      2.2,
    );
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
      map += featuredRoute(
        proj,
        [seg.length > 1 ? seg : [l.from, l.to]],
        [l.from, l.to],
        true,
        routeColor(l.routeId),
      );
    }
    const o = proj(legPts[0]);
    const d = proj(legPts[legPts.length - 1]);
    map += endPin(o.x, o.y) + stopMarker(d.x, d.y, 56);
  } else {
    const v = at(SOLOMOS, 4.2);
    map = baseMap(projector(v, MAP_CX, MAP_CY), shapes, v);
  }
  const t = titleBlock(PY + 232, p.destination || "A trip plan", 52, 2);
  let y = t.bottom + 46;
  const here = /^(your|current|my) location$/i.test((p.origin ?? "").trim());
  const fromSvg = p.origin && !here
    ? text(IN, y, wrap(`From ${p.origin}`, 26, TW, 1, 600)[0], {
        size: 26,
        weight: 600,
        fill: R.ink2,
      })
    : "";
  y += 28;
  let tiles = "";
  if (p.arrive || p.depart) {
    const tileH = 100;
    const big = p.arrive ?? p.depart ?? "";
    const small = p.arrive ? (p.depart ? `arrive, leave ${p.depart}` : "arrive") : "leave";
    tiles += `<rect x="${IN}" y="${y}" width="${TW}" height="${tileH}" rx="28" fill="${R.y}"/>${text(IN + 26, y + 54, big, { size: 44, weight: 800 })}${text(IN + 26, y + 84, small, { size: 20, weight: 600 })}`;
    const opt = { size: 22, h: 44, padX: 16 };
    // Bus legs in ride order, each pill in its line's feed colour.
    const seenLine = new Set<string>();
    const lines: { code: string; color: string }[] = [];
    for (const l of p.legs) {
      if (!l.routeShort || seenLine.has(l.routeShort)) continue;
      seenLine.add(l.routeShort);
      lines.push({ code: l.routeShort, color: routeColor(l.routeId) });
    }
    let px = IN + TW - 24;
    if (p.duration) {
      const w = pill(0, 0, p.duration, opt).w;
      px -= w;
      tiles += pill(px, y + 28, p.duration, { ...opt, fill: R.ink, color: R.white }).svg;
      px -= 10;
    }
    // Right to left: the first bus sits next to the time, later ones only if they fit.
    const fit: { code: string; color: string; w: number }[] = [];
    let room = px - (IN + 240);
    for (const l of lines.slice(0, 2)) {
      const w = pill(0, 0, l.code, opt).w;
      if (w + 10 > room) break;
      room -= w + 10;
      fit.push({ ...l, w });
    }
    let lx = px - fit.reduce((a, l) => a + l.w + 10, 0) + 10;
    for (const l of fit) {
      tiles += pill(lx, y + 28, l.code, { ...opt, fill: l.color, color: onColor(l.color) }).svg;
      lx += l.w + 10;
    }
  }
  const kicker = p.creator ? `Shared by ${p.creator}` : "Shared trip plan";
  const foot = [
    p.day,
    p.transfers ? `${p.transfers} ${p.transfers === 1 ? "change" : "changes"}` : "Direct",
  ]
    .filter(Boolean)
    .join(", ");
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, wrap(kicker, 18, TW, 1, 600)[0])}${eyebrow(IN, PY + 186, "Going to", R.ink2)}${t.svg}${fromSvg}${tiles}${footer(foot)}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ generic

/** Static card for any group link (drawn at build time, no group data). */
export function genericGroupCard(shapes: Shapes | null): string {
  const v = at(SOLOMOS, 4.2);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(SOLOMOS);
  const map = baseMap(proj, shapes, v) + stopMarker(c.x, c.y, 60);
  const t = titleBlock(PY + 206, "Travel together, live", 60, 2);
  const p = paragraph(
    t.bottom + 54,
    "Join the group and watch each other's buses reach the meeting point.",
  );
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, "Group trip")}${t.svg}${p.svg}${footer("Watch together on Aloya")}`;
  return frame(map, card);
}

/** Static card for any shared plan link (drawn at build time, no plan data). */
export function genericPlanCard(shapes: Shapes | null): string {
  const v = at(SOLOMOS, 4.2);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(SOLOMOS);
  const map = baseMap(proj, shapes, v) + stopMarker(c.x, c.y, 60);
  const t = titleBlock(PY + 206, "Your bus trip, planned", 60, 2);
  const p = paragraph(
    t.bottom + 54,
    "Open it to see each leg, the lines to take and when you get in.",
  );
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, "Shared trip plan")}${t.svg}${p.svg}${footer("aloya.cy")}`;
  return frame(map, card);
}

// ------------------------------------------------------------------ pages

function centreCard(
  p0: LatLng,
  mpp: number,
  kick: string,
  title: string,
  body: string,
  foot: string,
  shapes: Shapes | null,
): string {
  const v = at(p0, mpp);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(p0);
  const map = baseMap(proj, shapes, v) + stopMarker(c.x, c.y, 60);
  const t = titleBlock(PY + 206, title, 60, 2);
  const p = paragraph(t.bottom + 54, body);
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, kick)}${t.svg}${p.svg}${footer(foot)}`;
  return frame(map, card);
}

/** /lines: the whole island, every line in its own colour. */
export function networkCard(shapes: Shapes | null): string {
  // Paphos to Ayia Napa fills the map half of the card.
  const v: View = { lat: 34.9, lng: 33.3, mpp: 345 };
  const proj = projector(v, MAP_CX + 10, MAP_CY);
  let map = `<rect width="${W}" height="${H}" fill="${R.canvas}"/>`;
  const done = new Set<string>();
  for (const r of ROUTES) {
    if (done.has(r.id)) continue;
    done.add(r.id);
    const d = routePaths(r.id, shapes)
      .map((p) =>
        p
          .map(proj)
          .map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`)
          .join(""),
      )
      .join("");
    if (d)
      map += `<path d="${d}" fill="none" stroke="${routeColor(r.id)}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.9"/>`;
  }
  const t = titleBlock(PY + 206, "Every bus line in Cyprus", 60, 2);
  const p = paragraph(
    t.bottom + 54,
    "Nicosia, Limassol, Larnaca, Paphos, Famagusta and intercity, live.",
  );
  const y = p.bottom + 32;
  const a = pill(IN, y, `${NETWORK.lines} lines`, { fill: R.y, color: R.ink });
  const b = pill(IN + a.w + 12, y, `${NETWORK.stops.toLocaleString("en-GB")} stops`, {
    fill: R.pill,
    color: R.ink,
  });
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, "Bus lines")}${t.svg}${p.svg}${a.svg}${b.svg}${footer("Live buses on Aloya")}`;
  return frame(map, card);
}

export const pulseCard = (shapes: Shapes | null) =>
  centreCard(
    SOLOMOS,
    9,
    "Cyprus today",
    "How the island is moving today",
    "Weather, the buses right now, live sightings and a Greek word of the day.",
    "Daily on Aloya",
    shapes,
  );

export const passCard = (shapes: Shapes | null) =>
  centreCard(
    SOLOMOS,
    5,
    "Motion pass",
    "Your bus pass, always with you",
    "Balance, top ups and a scan ready Motion card in one place.",
    "aloya.cy",
    shapes,
  );

export const savedCard = (shapes: Shapes | null) =>
  centreCard(
    SOLOMOS,
    5,
    "Saved",
    "Your places, one tap away",
    "Home, work and the stops you use most, with live buses for each.",
    "aloya.cy",
    shapes,
  );

export const plannerCard = (shapes: Shapes | null) =>
  centreCard(
    SOLOMOS,
    6,
    "Plan a trip",
    "Door to door across Cyprus",
    "Live buses, walking and changes in one calm view.",
    "aloya.cy",
    shapes,
  );

/** /airport/:code: the airport stop with the lines that serve it. */
export function airportCard(code: string, stopId: string, shapes: Shapes | null): string {
  const s = getStop(stopId);
  if (!s) return defaultCard(shapes);
  const name = code.toLowerCase() === "pfo" ? "Paphos Airport" : "Larnaca Airport";
  const { codes, routeIds } = linesAtStop(s.id, s.agency);
  const v = at(s, 9);
  const proj = projector(v, MAP_CX, MAP_CY);
  const c = proj(s);
  const feat = routeIds
    .slice(0, 10)
    .reverse()
    .map((rid) => featuredRoute(proj, routePaths(rid, shapes), [], false, routeColor(rid)))
    .join("");
  const map = baseMap(proj, shapes, v) + feat + stopMarker(c.x, c.y, 68);
  const t = titleBlock(PY + 206, `${name} by bus`, 58, 2);
  let y = t.bottom + 58;
  const sub = text(IN, y, "Coaches and town buses, live", { size: 28, weight: 600, fill: R.ink2 });
  y += 26;
  const colorOf = lineColours(routeIds);
  const pills = codes.length ? pillRow(IN, y, codes, TW, codes.map((x) => colorOf.get(x))) : "";
  const card = `${brand(IN, PY + 44)}${eyebrow(IN, PY + 150, `Airport ${code.toUpperCase()}`)}${t.svg}${sub}${pills}${footer("Live departures on Aloya")}`;
  return frame(map, card);
}
