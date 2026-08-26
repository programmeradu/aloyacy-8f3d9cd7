// Station clustering — turning scattered GTFS stop records into the places
// riders actually stand.
//
// Cyprus feeds publish one record per *bay*, and several operators publish
// their own record for the same bay. Solomos Square in Nicosia is five rows
// spread across two feeds:
//
//   1     IC + NPT   Dionysios Solomos Square       35.17067, 33.35894
//   7420  NPT        Dionysios Solomos Square A     35.17079, 33.35901   ~13 m
//   7421  NPT        Dionysios Solomos Square C     35.17144, 33.35837   ~99 m
//   7189  LMS + NPT  Dionysios Solomos Square D     35.17138, 33.35824  ~103 m
//   7400  NPT        Solomos Square Alighting       35.17039, 33.35839   ~55 m
//
// A planner that treats those as five unrelated places cannot see that route
// 13 and route 19 both leave from the same terminal, so it invents a change:
// ride 13 out to a shared stop, then wait for the 19 you could have boarded
// at the next bay. This module removes that illusion.
//
// Everything is derived from the data, never declared by hand:
//   - stops closer than `SAME_POLE_M` are physically the same pole;
//   - stops within `SAME_STATION_M` whose normalised names describe the same
//     place (equal, or one a token-subset of the other) are the same station;
//   - a merge is rejected if it would stretch the station past
//     `MAX_STATION_DIAMETER_M`, so "everything downtown" can never collapse
//     into one blob.
//
// Pure and dependency-free so the build script, the server planner and the
// tests all agree on the same clustering.

import { distanceM } from "./geo";

export const SAME_POLE_M = 30;
export const SAME_STATION_M = 250;
export const MAX_STATION_DIAMETER_M = 400;

export type StationStopInput = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  agency: string;
};

export type Station = {
  /** Stable, deterministic id derived from the member keys. */
  id: string;
  /** Canonical rider-facing name (the shortest common description). */
  name: string;
  lat: number;
  lng: number;
  /** `agency:stopId` keys of every bay in this station. */
  members: string[];
  /** Widest bay-to-bay straight-line distance, in metres. */
  spreadM: number;
};

export type StationIndex = {
  stations: Map<string, Station>;
  /** `agency:stopId` and bare `stopId` → station id. */
  byStopKey: Map<string, string>;
};

export function stopKey(stop: { id: string; agency?: string }): string {
  return stop.agency ? `${stop.agency}:${stop.id}` : stop.id;
}

// ---- name normalisation ----------------------------------------------------

const BAY_SUFFIX =
  /\s+(?:bay|platform|stand|gate|bus\s*stop)?\s*(?:[a-z]|\d{1,2})$|\s+(?:alighting|arrivals?|departures?|drop\s*off|pick\s*up|terminus)$/;

const NOISE_TOKENS = new Set([
  "ave",
  "avenue",
  "str",
  "street",
  "road",
  "rd",
  "the",
  "and",
  "kai",
  "of",
  "st",
]);

/** Lowercase, de-accent, strip punctuation and trailing bay designators. */
export function normaliseStopName(raw: string): string {
  let s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[´`'’.,()/]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Bay letters can stack ("square a", "square bay 3"); strip repeatedly.
  for (let i = 0; i < 3; i++) {
    const next = s.replace(BAY_SUFFIX, "").trim();
    if (next === s || next.length < 3) break;
    s = next;
  }
  return s;
}

function meaningfulTokens(normalised: string): string[] {
  return normalised.split(" ").filter((t) => t.length > 1 && !NOISE_TOKENS.has(t));
}

function isSubsetOf(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.every((t) => set.has(t));
}

/**
 * Do two stop names describe the same place? Either identical once normalised,
 * or one is a token-subset of the other with at least two meaningful tokens in
 * common ("solomos square" ⊂ "dionysios solomos square"). The two-token floor
 * keeps generic names ("square", "station") from swallowing their neighbours.
 */
export function namesDescribeSamePlace(a: string, b: string): boolean {
  const na = normaliseStopName(a);
  const nb = normaliseStopName(b);
  if (na === nb) return true;
  const ta = meaningfulTokens(na);
  const tb = meaningfulTokens(nb);
  if (ta.length < 2 || tb.length < 2) return false;
  const shorter = ta.length <= tb.length ? ta : tb;
  const longer = shorter === ta ? tb : ta;
  return shorter.length >= 2 && isSubsetOf(shorter, longer);
}

// ---- clustering -------------------------------------------------------------

const BUCKET_DEG = 0.005; // ~500 m; a 250 m search never leaves the 9 neighbours

function bucketKey(lat: number, lng: number): string {
  return `${Math.floor(lat / BUCKET_DEG)}:${Math.floor(lng / BUCKET_DEG)}`;
}

type Pair = { a: number; b: number; m: number };

/**
 * Group bays into stations. Pairs are considered nearest-first so tight bays
 * bind before loose ones, and any union that would exceed the diameter cap is
 * rejected rather than silently accepted.
 */
export function buildStations(stops: StationStopInput[]): StationIndex {
  const buckets = new Map<string, number[]>();
  stops.forEach((s, i) => {
    const k = bucketKey(s.lat, s.lng);
    const b = buckets.get(k);
    if (b) b.push(i);
    else buckets.set(k, [i]);
  });

  const pairs: Pair[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const bl = Math.floor(s.lat / BUCKET_DEG);
    const bg = Math.floor(s.lng / BUCKET_DEG);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of buckets.get(`${bl + dy}:${bg + dx}`) ?? []) {
          if (j <= i) continue;
          const key = `${i}|${j}`;
          if (seen.has(key)) continue;
          const m = distanceM(s, stops[j]);
          if (m > SAME_STATION_M) continue;
          const linked = m <= SAME_POLE_M || namesDescribeSamePlace(s.name, stops[j].name);
          if (!linked) continue;
          seen.add(key);
          pairs.push({ a: i, b: j, m });
        }
      }
    }
  }
  pairs.sort((p, q) => p.m - q.m);

  // Union-find with an explicit member list so the diameter check is cheap.
  const parent = stops.map((_, i) => i);
  const members = stops.map((_, i) => [i]);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };

  for (const p of pairs) {
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra === rb) continue;
    const ma = members[ra];
    const mb = members[rb];
    let widest = 0;
    for (const x of ma) {
      for (const y of mb) {
        const d = distanceM(stops[x], stops[y]);
        if (d > widest) widest = d;
        if (widest > MAX_STATION_DIAMETER_M) break;
      }
      if (widest > MAX_STATION_DIAMETER_M) break;
    }
    if (widest > MAX_STATION_DIAMETER_M) continue;
    parent[rb] = ra;
    members[ra] = ma.concat(mb);
    members[rb] = [];
  }

  const grouped = new Map<number, number[]>();
  for (let i = 0; i < stops.length; i++) {
    const r = find(i);
    const g = grouped.get(r);
    if (g) g.push(i);
    else grouped.set(r, [i]);
  }

  const stations = new Map<string, Station>();
  const byStopKey = new Map<string, string>();
  for (const idxs of grouped.values()) {
    const memberStops = idxs.map((i) => stops[i]);
    const keys = memberStops.map(stopKey).sort();
    const id = `st:${keys[0]}`;
    const lat = memberStops.reduce((a, s) => a + s.lat, 0) / memberStops.length;
    const lng = memberStops.reduce((a, s) => a + s.lng, 0) / memberStops.length;
    let spreadM = 0;
    for (let i = 0; i < memberStops.length; i++) {
      for (let j = i + 1; j < memberStops.length; j++) {
        const d = distanceM(memberStops[i], memberStops[j]);
        if (d > spreadM) spreadM = d;
      }
    }
    stations.set(id, {
      id,
      name: canonicalName(memberStops.map((s) => s.name)),
      lat,
      lng,
      members: keys,
      spreadM: Math.round(spreadM),
    });
    for (const s of memberStops) {
      byStopKey.set(stopKey(s), id);
      if (!byStopKey.has(s.id)) byStopKey.set(s.id, id);
    }
  }

  return { stations, byStopKey };
}

/**
 * The name a rider would use for the whole place: the most common normalised
 * description, rendered from the shortest original spelling that matches it.
 */
export function canonicalName(names: string[]): string {
  const counts = new Map<string, { count: number; best: string }>();
  for (const n of names) {
    const key = normaliseStopName(n);
    const entry = counts.get(key);
    if (!entry) counts.set(key, { count: 1, best: n });
    else {
      entry.count++;
      if (n.length < entry.best.length) entry.best = n;
    }
  }
  let winner: { count: number; best: string } | null = null;
  for (const entry of counts.values()) {
    if (
      !winner ||
      entry.count > winner.count ||
      (entry.count === winner.count && entry.best.length < winner.best.length)
    ) {
      winner = entry;
    }
  }
  return winner?.best ?? names[0] ?? "";
}

// ---- lookup helpers ---------------------------------------------------------

/** Serialisable form written to `src/data/stations.json`. */
export type StationsFile = {
  generatedFrom: number;
  stations: Station[];
};

export function toStationsFile(index: StationIndex, stopCount: number): StationsFile {
  return {
    generatedFrom: stopCount,
    stations: [...index.stations.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function loadStations(file: StationsFile): StationIndex {
  const stations = new Map<string, Station>();
  const byStopKey = new Map<string, string>();
  for (const st of file.stations) {
    stations.set(st.id, st);
    for (const key of st.members) {
      byStopKey.set(key, st.id);
      const bare = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
      if (!byStopKey.has(bare)) byStopKey.set(bare, st.id);
    }
  }
  return { stations, byStopKey };
}

/** Station id for a stop, or the stop's own key when it stands alone. */
export function stationIdFor(
  index: StationIndex | null,
  stop: { id: string; agency?: string },
): string {
  if (!index) return stopKey(stop);
  return index.byStopKey.get(stopKey(stop)) ?? index.byStopKey.get(stop.id) ?? stopKey(stop);
}

export function sameStation(
  index: StationIndex | null,
  a: { id: string; agency?: string },
  b: { id: string; agency?: string },
): boolean {
  if (stopKey(a) === stopKey(b)) return true;
  if (!index) return false;
  const sa = index.byStopKey.get(stopKey(a)) ?? index.byStopKey.get(a.id);
  const sb = index.byStopKey.get(stopKey(b)) ?? index.byStopKey.get(b.id);
  return sa !== undefined && sa === sb;
}
