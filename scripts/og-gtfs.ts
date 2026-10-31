// Island-wide network geometry for the share cards, read from the raw Motion
// GTFS feeds at build time.
//
// The bundled app data (public/gtfs-shapes.json, src/data/route_*.json) only
// covers Nicosia and the intercity lines, so a Limassol, Larnaca, Paphos or
// Famagusta stop got an empty map and no line pills, and every line outside
// Nicosia fell back to the default card. This reads every feed the timetable
// ingest already downloads (.tmp/gtfs/feed<N>, fetched here when missing) and
// returns, keyed by the app's own route and stop ids:
//
//   shapes      route id -> { shapes: { shapeId: encoded polyline } } (simplified ~3 m)
//   seq         "routeId|dir" -> ordered stop ids (longest trip that way)
//   routeStops  route id -> every stop id any of its trips calls at
//   trips       GTFS trip id -> [routeId, first dep "HH:MM", first stop id, last stop id]
//
// The Worker reads the result from og/network.json and og/trips/*.json.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

/** Motion feed id -> agency code used in src/data/routes.json and stops.json. */
export const FEED_AGENCY: Record<number, string> = {
  2: "PFO",
  4: "FAM",
  5: "IC",
  6: "LMS",
  9: "NPT",
  10: "LCA",
  11: "SPC",
};

const BASE = "https://motionbuscard.org.cy/opendata/downloadfile?file=GTFS\\";

export type OgNetwork = {
  shapes: Record<string, { shapes: Record<string, string> }>;
  seq: Record<string, string[]>;
  routeStops: Record<string, string[]>;
  trips: Record<string, [string, string, string, string]>;
};

function csv(path: string): { h: Record<string, number>; rows: string[][] } {
  let t = readFileSync(path, "utf8");
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const lines = t.split(/\r?\n/).filter(Boolean);
  const h: Record<string, number> = {};
  lines[0].split(",").forEach((k, i) => (h[k.trim()] = i));
  return { h, rows: lines.slice(1).map((l) => l.split(",")) };
}

function ensureFeed(dir: string, id: number): boolean {
  if (existsSync(`${dir}/feed${id}/stop_times.txt`)) return true;
  try {
    mkdirSync(dir, { recursive: true });
    const zip = `${dir}/${id}.zip`;
    if (!existsSync(zip))
      execSync(`curl -sfL -A "Mozilla/5.0" -o "${zip}" "${BASE}${id}_google_transit.zip&rel=True"`);
    execSync(`unzip -oq "${zip}" -d "${dir}/feed${id}"`);
    return existsSync(`${dir}/feed${id}/stop_times.txt`);
  } catch (e) {
    console.warn(`og-gtfs: feed ${id} unavailable: ${(e as Error).message}`);
    return false;
  }
}

type P = [number, number];

/** Douglas-Peucker in degrees (tolerance ~3 m) keeps the network file light. */
function simplify(pts: P[], tol = 3e-5): P[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 1e-18;
    let best = -1;
    let bd = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let u = ((px - ax) * dx + (py - ay) * dy) / len;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const ex = ax + u * dx - px;
      const ey = ay + u * dy - py;
      const d = ex * ex + ey * ey;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function encode(pts: P[]): string {
  let out = "";
  let plat = 0;
  let plng = 0;
  const enc = (v: number) => {
    let s = v < 0 ? ~(v << 1) : v << 1;
    let r = "";
    while (s >= 0x20) {
      r += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
      s >>>= 5;
    }
    return r + String.fromCharCode(s + 63);
  };
  for (const [lat, lng] of pts) {
    const a = Math.round(lat * 1e5);
    const b = Math.round(lng * 1e5);
    out += enc(a - plat) + enc(b - plng);
    plat = a;
    plng = b;
  }
  return out;
}

const hhmm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Read every feed; routes the app does not know are skipped so ids always match pages. */
export function loadOgNetwork(
  knownRoutes: Set<string>,
  dir = resolve(process.env.OG_GTFS_DIR || ".tmp/gtfs"),
): OgNetwork {
  const net: OgNetwork = { shapes: {}, seq: {}, routeStops: {}, trips: {} };
  for (const [idStr, agency] of Object.entries(FEED_AGENCY)) {
    const id = Number(idStr);
    if (!ensureFeed(dir, id)) continue;
    const d = `${dir}/feed${id}`;

    const tr = csv(`${d}/trips.txt`);
    const tripRoute = new Map<string, string>();
    const tripDir = new Map<string, string>();
    const routeShapes = new Map<string, Set<string>>();
    for (const r of tr.rows) {
      const rid = r[tr.h.route_id];
      if (!knownRoutes.has(rid)) continue;
      const tid = r[tr.h.trip_id];
      tripRoute.set(tid, rid);
      tripDir.set(tid, String(Number(r[tr.h.direction_id]) || 0));
      const sid = tr.h.shape_id != null ? r[tr.h.shape_id] : "";
      if (sid) {
        let s = routeShapes.get(rid);
        if (!s) routeShapes.set(rid, (s = new Set()));
        s.add(sid);
      }
    }

    if (existsSync(`${d}/shapes.txt`)) {
      const sh = csv(`${d}/shapes.txt`);
      const pts = new Map<string, [number, number, number][]>();
      for (const r of sh.rows) {
        const sid = r[sh.h.shape_id];
        let a = pts.get(sid);
        if (!a) pts.set(sid, (a = []));
        a.push([
          Number(r[sh.h.shape_pt_sequence]),
          Number(r[sh.h.shape_pt_lat]),
          Number(r[sh.h.shape_pt_lon]),
        ]);
      }
      for (const [rid, sids] of routeShapes) {
        const out: Record<string, string> = {};
        for (const sid of sids) {
          const a = pts.get(sid);
          if (!a || a.length < 2) continue;
          a.sort((x, y) => x[0] - y[0]);
          const line = simplify(
            a
              .filter((p) => Number.isFinite(p[1]) && Number.isFinite(p[2]))
              .map((p) => [p[1], p[2]] as P),
          );
          if (line.length > 1) out[sid] = encode(line);
        }
        if (Object.keys(out).length) net.shapes[rid] = { shapes: out };
      }
    }

    const st = csv(`${d}/stop_times.txt`);
    const tripStops = new Map<string, [number, string, string][]>();
    for (const r of st.rows) {
      const tid = r[st.h.trip_id];
      if (!tripRoute.has(tid)) continue;
      let a = tripStops.get(tid);
      if (!a) tripStops.set(tid, (a = []));
      a.push([
        Number(r[st.h.stop_sequence]),
        r[st.h.stop_id],
        r[st.h.departure_time] || r[st.h.arrival_time],
      ]);
    }
    const stopSets = new Map<string, Set<string>>();
    for (const [tid, a] of tripStops) {
      a.sort((x, y) => x[0] - y[0]);
      const rid = tripRoute.get(tid)!;
      const key = `${rid}|${tripDir.get(tid)}`;
      const ids = a.map((x) => x[1]);
      if (!net.seq[key] || net.seq[key].length < ids.length) net.seq[key] = ids;
      let s = stopSets.get(rid);
      if (!s) stopSets.set(rid, (s = new Set()));
      for (const x of ids) s.add(x);
      if (a.length)
        net.trips[tid] = [rid, a[0][2] ? hhmm(a[0][2]) : "", a[0][1], a[a.length - 1][1]];
    }
    for (const [rid, s] of stopSets) net.routeStops[rid] = [...s];
    console.log(`og-gtfs: feed ${id} (${agency}) ${routeShapes.size} routes, ${tripStops.size} trips`);
  }
  return net;
}
