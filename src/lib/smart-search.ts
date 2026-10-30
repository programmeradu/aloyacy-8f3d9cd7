// Smart search for the Roam search sheet: one input, instant local results.
// Pure (no DOM, no network): accent-insensitive, Greek and Greeklish aware,
// typo tolerant. "eleftheria", "ελευθερια" and "elefteria" all reach
// Eleftheria Square. Places from the geocoder and the trip parser are merged
// in by the sheet; this module ranks what we hold on the phone.

export type Pt = { lat: number; lng: number };

const GREEK_DIGRAPHS: [RegExp, string][] = [
  [/ου/g, "ou"],
  [/αυ(?=[θκξπσςτφχψ]|$)/g, "af"],
  [/αυ/g, "av"],
  [/ευ(?=[θκξπσςτφχψ]|$)/g, "ef"],
  [/ευ/g, "ev"],
  [/ει/g, "i"],
  [/οι/g, "i"],
  [/αι/g, "e"],
  [/μπ/g, "b"],
  [/ντ/g, "d"],
  [/γκ/g, "g"],
  [/γγ/g, "ng"],
];
const GREEK_LETTERS: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k",
  λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t",
  υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

/** Lowercase, no accents, Greek transliterated to Latin. */
export function toLatin(s: string): string {
  let t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u00b4\u0384\u0385]/g, "");
  if (/[\u0370-\u03ff]/.test(t)) {
    for (const [re, v] of GREEK_DIGRAPHS) t = t.replace(re, v);
    t = t.replace(/[\u0370-\u03ff]/g, (c) => GREEK_LETTERS[c] ?? "");
  }
  return t;
}

/**
 * Phonetic key that folds the usual Greeklish spellings together:
 * th/t, ph/f, ch/kh/x, y/i/ee/ei/oi, ai/e, ou/u, w/o, b/v, doubled letters.
 */
export function phoneticKey(s: string): string {
  return toLatin(s)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/(ch|kh)/g, "x")
    .replace(/(ee|ei|oi|y)/g, "i")
    .replace(/ai/g, "e")
    .replace(/ou/g, "u")
    .replace(/w/g, "o")
    .replace(/b/g, "v")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Optimal string alignment distance, capped (returns cap+1 when over). */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** How well one query token matches one name token (0 = no match, 1 best). */
function tokenScore(q: string, t: string): number {
  if (t === q) return 1;
  if (t.startsWith(q)) return q.length >= 2 ? 0.9 : 0.6;
  if (q.length >= 4) {
    // Typos: compare against the same-length head of the name token too, so a
    // half-typed word with one slip ("elefter") still finds "elefteria".
    const head = t.slice(0, q.length);
    const cap = q.length >= 8 ? 2 : 1;
    const d = Math.min(editDistance(q, t, cap), editDistance(q, head, cap));
    if (d <= cap) return 0.75 - d * 0.12;
  }
  return 0;
}

/** Score a name against a query (0 = no match). Every query token must match. */
export function matchScore(query: string, name: string): number {
  const qt = phoneticKey(query).split(" ").filter(Boolean);
  if (qt.length === 0) return 0;
  const nt = phoneticKey(name).split(" ").filter(Boolean);
  let total = 0;
  for (const q of qt) {
    let best = 0;
    for (const t of nt) best = Math.max(best, tokenScore(q, t));
    if (best === 0) return 0;
    total += best;
  }
  // Prefer names whose first word matches and shorter, tighter names.
  const firstBonus = tokenScore(qt[0], nt[0] ?? "") > 0 ? 0.25 : 0;
  return total / qt.length + firstBonus - Math.min(0.2, nt.length * 0.02);
}

function distKm(a: Pt, b: Pt) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type StopIn = { id: string; name: string; lat: number; lng: number; agency: string };
export type RouteIn = { id: string; short: string; long: string; agency: string };

export type StopHit = { kind: "stop"; id: string; name: string; km: number; score: number };
export type LineHit = { kind: "line"; id: string; code: string; name: string; score: number };

/** Stops by fuzzy name, one per name (the nearest), nearer first among equals. */
export function searchStops(query: string, stops: StopIn[], near: Pt | null, limit = 6): StopHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const byName = new Map<string, StopHit>();
  for (const s of stops) {
    const sc = matchScore(q, s.name);
    if (sc <= 0) continue;
    const km = near ? distKm(near, s) : 0;
    const key = s.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev || km < prev.km) byName.set(key, { kind: "stop", id: s.id, name: s.name, km, score: sc });
  }
  return [...byName.values()]
    .sort((a, b) => b.score - a.score + (near ? (a.km - b.km) * 0.02 : 0))
    .slice(0, limit);
}

/** Lines by number (exact, then prefix) and by destination words. */
export function searchLines(query: string, routes: RouteIn[], limit = 5): LineHit[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];
  const num = raw.match(/^(?:line|bus|γραμμη|λεωφορειο)?\s*([a-z]?\d{1,3}[a-z]?)\b/i)?.[1];
  const hits: LineHit[] = [];
  const seen = new Set<string>();
  for (const r of routes) {
    const short = r.short.toLowerCase();
    let sc = 0;
    if (num && short === num) sc = 3;
    else if (num && short.startsWith(num)) sc = 2;
    else if (raw.length >= 3 && !/^\d+$/.test(raw)) {
      const m = matchScore(raw, r.long);
      if (m > 0.6) sc = m;
    }
    if (sc <= 0) continue;
    const k = `${r.short}|${r.long}`;
    if (seen.has(k)) continue;
    seen.add(k);
    hits.push({ kind: "line", id: r.id, code: r.short, name: r.long, score: sc });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type Intent = {
  /** Where to, in the rider's words (null when the query names no place). */
  to: string | null;
  /** Leave at this time (ISO), when the rider gave one. */
  leaveAtISO: string | null;
  /** "last bus" / "first bus" flavour. */
  edge: "last" | "first" | null;
  /** "next 30" style: a line number. */
  line: string | null;
  /** "from here" / no origin given: start at the rider's location. */
  fromHere: boolean;
};

const TIME_RE = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/;

/** Fast local parse of the common trip phrasings (no network). */
export function parseIntent(text: string, now = new Date()): Intent | null {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return null;
  let edge: Intent["edge"] = null;
  if (/\blast\s+bus\b|τελευταιο/.test(toLatin(t)) || /\blast\b/.test(t)) edge = "last";
  else if (/\bfirst\s+bus\b/.test(t)) edge = "first";
  const lineM = t.match(/^(?:next|when'?s?(?:\s+is)?(?:\s+the)?(?:\s+next)?)\s+(?:bus\s+|line\s+)?([a-z]?\d{1,3}[a-z]?)\b/);
  const fromHere = /\bfrom\s+(here|my location|me)\b/.test(t) || !/\bfrom\s+/.test(t);

  let to: string | null = null;
  const toM = t.match(/\b(?:to|towards|για|προς)\s+(.+)$/);
  if (toM) {
    to = toM[1]
      .replace(/\b(today|tonight|tomorrow|now|asap)\b.*$/, "")
      .replace(/\b(at|by|around|in)\s+\d.*$/, "")
      .replace(TIME_RE, (m, h, mm, ap) => (ap || mm ? "" : m))
      .replace(/\b(from here|from my location)\b/, "")
      .trim();
    if (!to) to = null;
  }

  let leaveAtISO: string | null = null;
  const inMin = t.match(/\bin\s+(\d{1,3})\s*(?:min|mins|minutes)\b/);
  if (inMin) leaveAtISO = new Date(now.getTime() + Number(inMin[1]) * 60_000).toISOString();
  else {
    const tm = t.match(/\b(?:at|by|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))\b/);
    if (tm) {
      let h = Number(tm[1] ?? tm[4]);
      const m = Number(tm[2] ?? tm[5] ?? 0);
      const ap = tm[3];
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      if (h <= 23 && m <= 59) {
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        if (/\btomorrow\b|αυριο/.test(toLatin(t))) d.setDate(d.getDate() + 1);
        else if (d.getTime() < now.getTime() - 5 * 60_000) d.setDate(d.getDate() + 1);
        leaveAtISO = d.toISOString();
      }
    } else if (/\btomorrow\b/.test(t)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      leaveAtISO = d.toISOString();
    }
  }
  const line = lineM ? lineM[1] : null;
  if (!to && !line && !edge) return null;
  return { to, leaveAtISO, edge, line, fromHere };
}
