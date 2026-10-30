// Pure helpers for the Lines tab: one row per operator + line number, with a
// readable destination and origin pulled from the GTFS long name.
import type { StaticRoute, StaticStop } from "@/lib/gtfs";

export type Operator = "all" | "NPT" | "IC" | "LMS" | "LCA" | "PFO" | "FAM" | "kapnos" | "nextbike";

export type LineRow = {
  routeId: string;
  short: string;
  agency: string;
  dest: string;
  origin: string | null;
};

/** GTFS long names look like "A - B - C" (sometimes truncated by the feed). */
export function splitLong(long: string): { origin: string | null; dest: string } {
  const parts = long
    .split(/\s+-\s+|\s+–\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { origin: null, dest: long.trim() };
  if (parts.length === 1) return { origin: null, dest: parts[0] };
  return { origin: parts[0], dest: parts[parts.length - 1] };
}

function lineSort(a: LineRow, b: LineRow) {
  const na = parseInt(a.short, 10);
  const nb = parseInt(b.short, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.short.localeCompare(b.short, "en", { numeric: true });
}

/** One row per agency + short name (the feed lists each direction/variant). */
export function lineRows(routes: StaticRoute[]): LineRow[] {
  const seen = new Map<string, LineRow>();
  for (const r of routes) {
    const key = `${r.agency}|${r.short}`;
    if (seen.has(key)) continue;
    const { origin, dest } = splitLong(r.long);
    seen.set(key, { routeId: r.id, short: r.short, agency: r.agency, dest, origin });
  }
  return [...seen.values()].sort(lineSort);
}

export function filterLines(rows: LineRow[], op: Operator, q: string): LineRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (op !== "all" && op !== "kapnos" && op !== "nextbike" && r.agency !== op) return false;
    if (op === "kapnos" || op === "nextbike") return false;
    if (!needle) return true;
    return r.short.toLowerCase() === needle || r.short.toLowerCase().startsWith(needle) || r.dest.toLowerCase().includes(needle) || (r.origin ?? "").toLowerCase().includes(needle);
  });
}

export function matchStops(stops: StaticStop[], q: string, limit = 6): StaticStop[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 3) return [];
  const out: StaticStop[] = [];
  const seen = new Set<string>();
  for (const s of stops) {
    if (!s.name.toLowerCase().includes(needle)) continue;
    const k = `${s.name}|${s.agency}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export const OPERATOR_KEYS: Record<Exclude<Operator, "all" | "kapnos" | "nextbike">, "lines.nicosia" | "lines.intercity" | "lines.limassol" | "lines.larnaca" | "lines.paphos" | "lines.famagusta"> = {
  NPT: "lines.nicosia",
  IC: "lines.intercity",
  LMS: "lines.limassol",
  LCA: "lines.larnaca",
  PFO: "lines.paphos",
  FAM: "lines.famagusta",
};
