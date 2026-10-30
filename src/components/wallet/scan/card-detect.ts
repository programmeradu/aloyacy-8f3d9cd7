// Card detection for the Motion card scanner. Pure functions over grayscale
// pixel arrays, so they run in unit tests and on any frame size.
//
// The rider holds the card inside a card-shaped guide. For each side of the
// guide we look, in a band around it, for straight contrast steps (a small
// Hough search) and keep several candidates, because a plaid blanket can
// out-score the real card edge. Every combination of four lines is checked:
// convex, near-rectangular, ID-1 shaped (85.6 x 54 mm, ratio ~1.586), filling
// most of the guide, edges that stop at the corners, a pale smooth rim of card
// stock brighter than what lies outside, no background stripe lining up across
// the outline and no straight line running through the inside. A blanket or a
// desk alone never passes, so nothing is read from it.

export type Gray = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };
export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // tl, tr, br, bl
export type Rect = { x: number; y: number; w: number; h: number };

export const ID1_RATIO = 85.6 / 54;
/**
 * Detector thresholds, tuned on synthetic Motion cards over plaid, tartan,
 * rotated stripes and random knit (card-detect.test.ts): cards are found,
 * fabric alone never forms a card.
 */
export const TUNE = {
  /** Share of an edge's samples that must carry the contrast step. */
  sup: 0.25,
  /** Candidate edges kept per side. */
  max: 8,
  /** Every third of an edge must carry this share (0 = off for card edges). */
  third: 0,
  /** Background pattern lining up across the outline (correlation). */
  cross: 0.5,
  /** Rim just inside the outline: pale share and calm (smooth) share. */
  pale: 0.55,
  calm: 0.7,
  /** Rim samples near the rim median, and brighter than just outside. */
  uniform: 0.5,
  across: 0.3,
  /** A straight line crossing the inside edge to edge (a stripe). */
  thrSup: 0.6,
  thrThird: 0.45,
} as const;

/** RGBA -> luminance (fast integer approximation). */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return { data: out, width, height };
}

type Line = { a: number; b: number; strength: number; support: number; sign: number };

/**
 * Candidate straight edges in a band (a small Hough search), strongest first.
 * horizontal=true: the edge runs left-right, y = a*(x - xc) + b with the band
 * limiting b to [lo, hi]; otherwise the transpose. A candidate line scores the
 * mean signed gradient along it, so it must be one long, single-direction
 * contrast step. A busy background (plaid, a blanket) can out-score the real
 * card edge, so several well separated candidates are returned and the quad
 * check below picks the combination that behaves like a card.
 */
export function edgeCandidates(
  g: Gray,
  horizontal: boolean,
  lo: number,
  hi: number,
  from: number,
  to: number,
  /** Required contrast direction: 1 dark to light, -1 light to dark, 0 either. */
  wantSign = 0,
  max: number = TUNE.max,
  minSupport: number = TUNE.sup,
  minThird: number = TUNE.third,
): Line[] {
  const { data, width } = g;
  const step = 2;
  const cols: number[] = [];
  for (let s = Math.max(1, from); s < to - 1; s += step) cols.push(s);
  if (cols.length < 8 || hi - lo < 6) return [];
  const rows = hi - lo;
  // Signed 4 px gradient across the band for each sampled column.
  const grad = new Float32Array(cols.length * rows);
  for (let c = 0; c < cols.length; c++) {
    const s = cols[c];
    for (let t = 0; t < rows; t++) {
      const y = lo + t;
      let d = 0;
      if (horizontal) {
        if (y >= 2 && y < g.height - 2) d = data[(y + 2) * width + s] - data[(y - 2) * width + s];
      } else if (y >= 2 && y < width - 2) d = data[s * width + y + 2] - data[s * width + y - 2];
      grad[c * rows + t] = d;
    }
  }
  const xc = (cols[0] + cols[cols.length - 1]) / 2;
  const n = cols.length;
  const found: { score: number; a: number; b: number; sign: number; support: number }[] = [];
  const third = new Uint8Array(n);
  for (let c = 0; c < n; c++) third[c] = Math.min(2, Math.floor((c * 3) / n));
  const per = [Math.ceil(n / 3), Math.ceil(n / 3), n - 2 * Math.ceil(n / 3)];
  for (let ai = -10; ai <= 10; ai++) {
    const a = ai * 0.014; // about +-8 degrees
    for (let b = 2; b < rows - 2; b++) {
      let pos = 0;
      let neg = 0;
      let supP = 0;
      let supN = 0;
      const tp = [0, 0, 0];
      const tn = [0, 0, 0];
      for (let c = 0; c < n; c++) {
        const t = Math.round(a * (cols[c] - xc) + b);
        if (t < 0 || t >= rows) continue;
        const d = grad[c * rows + t];
        if (d > 0) {
          pos += d;
          if (d >= 24) {
            supP++;
            tp[third[c]]++;
          }
        } else {
          neg -= d;
          if (d <= -24) {
            supN++;
            tn[third[c]]++;
          }
        }
      }
      // The step must hold along the whole edge, not in a few fragments:
      // every third of the edge carries part of it.
      const minP = Math.min(tp[0] / per[0], tp[1] / per[1], tp[2] / per[2]);
      const minN = Math.min(tn[0] / per[0], tn[1] / per[1], tn[2] / per[2]);
      if (wantSign >= 0 && pos / n >= 22 && supP / n >= minSupport && minP >= minThird)
        found.push({ score: pos / n, a, b, sign: 1, support: supP / n });
      if (wantSign <= 0 && neg / n >= 22 && supN / n >= minSupport && minN >= minThird)
        found.push({ score: neg / n, a, b, sign: -1, support: supN / n });
    }
  }
  found.sort((p, q) => q.score - p.score);
  const picked: typeof found = [];
  for (const f of found) {
    // One candidate per edge: skip near-duplicates (same place, same sign).
    if (picked.some((p) => p.sign === f.sign && Math.abs(p.b - f.b) < 5)) continue;
    picked.push(f);
    if (picked.length >= max) break;
  }
  // Convert to the y = a*x + b form in image coordinates.
  return picked.map((f) => ({
    a: f.a,
    b: lo + f.b - f.a * xc,
    strength: f.score,
    support: f.support,
    sign: f.sign,
  }));
}

/** The strongest edge in a band (see edgeCandidates). */
export function edgeInBand(
  g: Gray,
  horizontal: boolean,
  lo: number,
  hi: number,
  from: number,
  to: number,
  wantSign = 0,
): Line | null {
  return edgeCandidates(g, horizontal, lo, hi, from, to, wantSign, 1)[0] ?? null;
}

/** Does the same contrast step continue past both ends of the edge? */
function runsOn(g: Gray, horizontal: boolean, l: Line, s0: number, s1: number): boolean {
  const len = Math.abs(s1 - s0);
  const lim = horizontal ? g.width : g.height;
  const across = horizontal ? g.height : g.width;
  let hits = 0;
  let total = 0;
  const probe = (from: number, to: number) => {
    for (let s = Math.round(from); s < Math.round(to); s += 2) {
      if (s < 2 || s >= lim - 2) continue;
      const t = Math.round(l.a * s + l.b);
      let bestD = 0;
      for (let o = -2; o <= 2; o++) {
        const u = t + o;
        if (u < 2 || u >= across - 2) continue;
        const d = horizontal
          ? g.data[(u + 2) * g.width + s] - g.data[(u - 2) * g.width + s]
          : g.data[s * g.width + u + 2] - g.data[s * g.width + u - 2];
        if (d * l.sign > bestD) bestD = d * l.sign;
      }
      total++;
      if (bestD >= 24) hits++;
    }
  };
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  probe(lo - len * 0.2, lo - len * 0.04);
  probe(hi + len * 0.04, hi + len * 0.2);
  return total >= 6 && hits / total > 0.5;
}

function intersect(h: Line, v: Line): Pt {
  // h: y = a1 x + b1 ; v: x = a2 y + b2
  const y = (h.a * v.b + h.b) / (1 - h.a * v.a);
  const x = v.a * y + v.b;
  return { x, y };
}

function angleAt(p: Pt, q: Pt, r: Pt) {
  const ax = p.x - q.x;
  const ay = p.y - q.y;
  const bx = r.x - q.x;
  const by = r.y - q.y;
  const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

export function quadArea(q: Quad) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    s += p.x * n.y - n.x * p.y;
  }
  return Math.abs(s) / 2;
}

export type Detection = { quad: Quad; ratio: number; fill: number; strength: number };

/**
 * Find the card outline near `guide` (the card-shaped frame, in g's pixels).
 * band: how far (fraction of guide height) an edge may sit from the guide.
 */
export function detectCard(g: Gray, guide: Rect, band = 0.22): Detection | null {
  const bh = guide.h * band;
  const bw = guide.w * band * 0.7;
  const x0 = Math.round(guide.x + guide.w * 0.12);
  const x1 = Math.round(guide.x + guide.w * 0.88);
  const y0 = Math.round(guide.y + guide.h * 0.15);
  const y1 = Math.round(guide.y + guide.h * 0.85);
  const clampY = (v: number) => Math.max(0, Math.min(g.height, Math.round(v)));
  const clampX = (v: number) => Math.max(0, Math.min(g.width, Math.round(v)));
  // A Motion card is white: its inside is brighter than what is around it,
  // so the top and left edges step up into the card, bottom and right step down.
  const tops = edgeCandidates(g, true, clampY(guide.y - bh), clampY(guide.y + bh), x0, x1, 1);
  if (!tops.length) return null;
  const bottoms = edgeCandidates(
    g,
    true,
    clampY(guide.y + guide.h - bh),
    clampY(guide.y + guide.h + bh),
    x0,
    x1,
    -1,
  );
  if (!bottoms.length) return null;
  const lefts = edgeCandidates(g, false, clampX(guide.x - bw), clampX(guide.x + bw), y0, y1, 1);
  if (!lefts.length) return null;
  const rights = edgeCandidates(
    g,
    false,
    clampX(guide.x + guide.w - bw),
    clampX(guide.x + guide.w + bw),
    y0,
    y1,
    -1,
  );
  if (!rights.length) return null;

  let best: Detection | null = null;
  for (const top of tops)
    for (const bottom of bottoms) {
      // Opposite card edges are near parallel (the phone is roughly flat).
      if (Math.abs(top.a - bottom.a) > 0.05) continue;
      for (const left of lefts)
        for (const right of rights) {
          if (Math.abs(left.a - right.a) > 0.05) continue;
          const d = quadFrom(g, guide, top, bottom, left, right);
          if (d && (!best || d.strength > best.strength)) best = d;
        }
    }
  return best;
}

function quadFrom(
  g: Gray,
  guide: Rect,
  top: Line,
  bottom: Line,
  left: Line,
  right: Line,
): Detection | null {
  const quad: Quad = [
    intersect(top, left),
    intersect(top, right),
    intersect(bottom, right),
    intersect(bottom, left),
  ];
  for (let i = 0; i < 4; i++) {
    const ang = angleAt(quad[(i + 3) % 4], quad[i], quad[(i + 1) % 4]);
    if (ang < 72 || ang > 108) return null;
  }
  const wTop = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const wBot = Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y);
  const hL = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  const hR = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
  const ratio = (wTop + wBot) / (hL + hR);
  if (Math.abs(ratio - ID1_RATIO) / ID1_RATIO > 0.12) return null;
  const fill = quadArea(quad) / (guide.w * guide.h);
  if (fill < 0.55 || fill > 1.6) return null;
  // Card edges stop at the card's corners; stripes in a texture run on.
  if (
    runsOn(g, true, top, quad[0].x, quad[1].x) ||
    runsOn(g, true, bottom, quad[3].x, quad[2].x) ||
    runsOn(g, false, left, quad[0].y, quad[3].y) ||
    runsOn(g, false, right, quad[1].y, quad[2].y)
  )
    return null;
  // The card's border just inside its outline is pale and calm (white card
  // stock); inside a plaid the same ring crosses dark and coloured stripes.
  const rim = rimStats(g, quad, 0.03);
  if (rim.total < 120 || rim.pale < TUNE.pale || rim.calm < TUNE.calm) return null;
  const rc = rimContrast(g, quad);
  if (rc.uniform < TUNE.uniform || rc.across < TUNE.across || rc.mi < rc.mo + 15) return null;
  if (stripesCross(g, quad)) return null;
  if (lineThrough(g, quad)) return null;
  const strength = (top.strength + bottom.strength + left.strength + right.strength) / 4;
  return { quad, ratio, fill, strength };
}

/** Grey value at (u, v) of the quad's own grid; u, v may lie outside 0..1. */
export function sampleQuad(g: Gray, q: Quad, u: number, v: number): number {
  const tx = q[0].x + (q[1].x - q[0].x) * u;
  const ty = q[0].y + (q[1].y - q[0].y) * u;
  const bx = q[3].x + (q[2].x - q[3].x) * u;
  const by = q[3].y + (q[2].y - q[3].y) * u;
  const x = Math.round(tx + (bx - tx) * v);
  const y = Math.round(ty + (by - ty) * v);
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return -1;
  return g.data[y * g.width + x];
}

/** Mean derivative profile along u (rows) or v (columns) over several lines. */
function profile(g: Gray, q: Quad, alongU: boolean, at: number[], N = 96): Float32Array | null {
  const out = new Float32Array(N - 1);
  for (const a of at) {
    let prev = -1;
    for (let i = 0; i < N; i++) {
      const t = 0.06 + (0.88 * i) / (N - 1);
      const v = alongU ? sampleQuad(g, q, t, a) : sampleQuad(g, q, a, t);
      if (v < 0) return null;
      if (i) out[i - 1] += v - prev;
      prev = v;
    }
  }
  return out;
}

function corr(a: Float32Array, b: Float32Array) {
  let sa = 0;
  let sb = 0;
  let sab = 0;
  for (let i = 0; i < a.length; i++) {
    sa += a[i] * a[i];
    sb += b[i] * b[i];
    sab += a[i] * b[i];
  }
  if (sa < 1 || sb < 1) return 0;
  return sab / Math.sqrt(sa * sb);
}

/**
 * True when the background's stripes run straight through the quad: the
 * pattern just outside one edge lines up with the pattern inside. That is a
 * box drawn by a plaid or a blanket weave, never a card lying on top of it.
 */
function stripesCross(g: Gray, q: Quad): boolean {
  const inside = [0.3, 0.42, 0.58, 0.7];
  for (const alongU of [true, false]) {
    const inP = profile(g, q, alongU, inside);
    if (!inP) continue;
    for (const outAt of [
      [-0.1, -0.16],
      [1.1, 1.16],
    ]) {
      const outP = profile(g, q, alongU, outAt);
      if (outP && corr(inP, outP) > TUNE.cross) return true;
    }
  }
  return false;
}

/** Rim statistics: pale share and calm share (small steps between neighbours). */
export function rimStats(g: Gray, q: Quad, inset = 0.04) {
  let pale = 0;
  let calm = 0;
  let total = 0;
  let steps = 0;
  const N = 60;
  const edges: [number, number, number, number][] = [
    [0, inset, 1, inset],
    [0, 1 - inset, 1, 1 - inset],
    [inset, 0, inset, 1],
    [1 - inset, 0, 1 - inset, 1],
  ];
  for (const [u0, v0, u1, v1] of edges) {
    let prev = -1;
    for (let i = 0; i <= N; i++) {
      const t = 0.08 + (0.84 * i) / N;
      const v = sampleQuad(g, q, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
      if (v < 0) {
        prev = -1;
        continue;
      }
      total++;
      if (v >= 150) pale++;
      if (prev >= 0) {
        steps++;
        if (Math.abs(v - prev) < 14) calm++;
      }
      prev = v;
    }
  }
  return { pale: total ? pale / total : 0, calm: steps ? calm / steps : 0, total };
}

/** Ring samples at a given inset (negative = outside the quad). */
export function ringSamples(g: Gray, q: Quad, inset: number, N = 60): number[] {
  const out: number[] = [];
  const edges: [number, number, number, number][] = [
    [0, inset, 1, inset],
    [0, 1 - inset, 1, 1 - inset],
    [inset, 0, inset, 1],
    [1 - inset, 0, 1 - inset, 1],
  ];
  for (const [u0, v0, u1, v1] of edges)
    for (let i = 0; i <= N; i++) {
      const t = 0.08 + (0.84 * i) / N;
      const v = sampleQuad(g, q, u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
      if (v >= 0) out.push(v);
    }
  return out;
}

export function median(a: number[]) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

/** Rim uniformity and contrast with what lies just outside. */
export function rimContrast(g: Gray, q: Quad) {
  const ins = ringSamples(g, q, 0.035);
  const outs = ringSamples(g, q, -0.04);
  const mi = median(ins);
  const near = ins.filter((v) => Math.abs(v - mi) <= 22).length / (ins.length || 1);
  // Per-sample contrast across the outline: inside minus outside.
  let up = 0;
  const n = Math.min(ins.length, outs.length);
  for (let i = 0; i < n; i++) if (ins[i] - outs[i] >= 20) up++;
  return { mi, mo: median(outs), uniform: near, across: n ? up / n : 0 };
}

/**
 * A long straight contrast line running across the inside of the quad, edge
 * to edge: a stripe of the background, never part of a card lying on it.
 */
function lineThrough(g: Gray, q: Quad): boolean {
  const xMin = Math.max(q[0].x, q[3].x);
  const xMax = Math.min(q[1].x, q[2].x);
  const yMin = Math.max(q[0].y, q[1].y);
  const yMax = Math.min(q[2].y, q[3].y);
  if (!(xMax > xMin && yMax > yMin)) return false;
  const w = xMax - xMin;
  const h = yMax - yMin;
  const H = edgeCandidates(
    g,
    true,
    Math.round(yMin + h * 0.12),
    Math.round(yMax - h * 0.12),
    Math.round(xMin + w * 0.04),
    Math.round(xMax - w * 0.04),
    0,
    1,
    TUNE.thrSup,
    TUNE.thrThird,
  );
  if (H.length) return true;
  const V = edgeCandidates(
    g,
    false,
    Math.round(xMin + w * 0.08),
    Math.round(xMax - w * 0.08),
    Math.round(yMin + h * 0.06),
    Math.round(yMax - h * 0.06),
    0,
    1,
    TUNE.thrSup,
    TUNE.thrThird,
  );
  return V.length > 0;
}

/** Largest corner movement between two quads, as a fraction of `scale`. */
export function quadDrift(a: Quad, b: Quad, scale: number) {
  let m = 0;
  for (let i = 0; i < 4; i++) m = Math.max(m, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
  return m / scale;
}

/** Variance of the 4-neighbour Laplacian: higher = sharper. */
export function sharpness(g: Gray): number {
  const { data, width, height } = g;
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x;
      const l = data[i - 1] + data[i + 1] + data[i - width] + data[i + width] - 4 * data[i];
      sum += l;
      sq += l * l;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sq / n - mean * mean;
}

/** Share of blown-out pixels (specular glare). */
export function glareShare(g: Gray): number {
  let c = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i] >= 253) c++;
  return c / g.data.length;
}

/** Share of near-white pixels: a Motion card is mostly white on both sides. */
export function whiteShare(g: Gray): number {
  let c = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i] >= 170) c++;
  return c / g.data.length;
}

// ---------------------------------------------------------------- warp

/** Homography mapping the unit square corners to `q` (dest -> source). */
function squareToQuad(q: Quad) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  };
}

/** Perspective-warp the quad in `src` (RGBA) to a flat W x H RGBA image. */
export function warpQuad(
  src: { data: Uint8ClampedArray; width: number; height: number },
  q: Quad,
  W: number,
  H: number,
): Uint8ClampedArray<ArrayBuffer> {
  const m = squareToQuad(q);
  const out = new Uint8ClampedArray(W * H * 4);
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;
  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const z = m.g * u + m.h * v + 1;
      const fx = (m.a * u + m.b * v + m.c) / z;
      const fy = (m.d * u + m.e * v + m.f) / z;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const o = (y * W + x) * 4;
      if (ix < 0 || iy < 0 || ix >= sw - 1 || iy >= sh - 1) {
        out[o + 3] = 255;
        continue;
      }
      const ax = fx - ix;
      const ay = fy - iy;
      const i00 = (iy * sw + ix) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[i00 + k] * (1 - ax) + sd[i10 + k] * ax;
        const bot = sd[i01 + k] * (1 - ax) + sd[i11 + k] * ax;
        out[o + k] = top * (1 - ay) + bot * ay;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
