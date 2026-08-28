// Next departure per (agency, short name) from a live snapshot.
// Marketing and the rider must quote the same feed. Pure — no clock, no I/O.

export type BoardKey = { agency: string; short: string };

export type BoardArrival = {
  stopId: string;
  routeId: string;
  tripId: string;
  arrivalUnix: number;
  delaySec: number;
};

export type BoardHint = {
  tripId: string;
};

export type BoardRow = {
  key: string;
  etaMin: number;
  source: "live" | "predicted";
  routeId: string;
  tripId: string;
  stopId: string;
};

export function boardKey(agency: string, short: string): string {
  return `${agency}:${short}`;
}

export function parseBoardQuery(q: string): BoardKey[] {
  const seen = new Set<string>();
  const out: BoardKey[] = [];
  for (const part of q.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 1) continue;
    const agency = trimmed.slice(0, colon).toUpperCase();
    const short = trimmed.slice(colon + 1).trim();
    if (!agency || !short) continue;
    const key = boardKey(agency, short);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ agency, short });
    if (out.length >= 20) break;
  }
  return out;
}

export function pickBoardRows(
  keys: BoardKey[],
  arrivals: BoardArrival[],
  liveTripIds: Iterable<string>,
  ghostTripIds: Iterable<string>,
  routeOf: (routeId: string) => { short: string; agency: string } | undefined,
  nowSec: number,
): Map<string, BoardRow> {
  const want = new Set(keys.map((k) => boardKey(k.agency, k.short)));
  const live = new Set(liveTripIds);
  const ghost = new Set(ghostTripIds);
  const best = new Map<string, BoardRow>();

  for (const a of arrivals) {
    if (a.arrivalUnix < nowSec - 60) continue;
    if (ghost.has(a.tripId) && !live.has(a.tripId)) continue;
    const route = routeOf(a.routeId);
    if (!route) continue;
    const key = boardKey(route.agency, route.short);
    if (!want.has(key)) continue;
    const etaMin = Math.max(0, Math.round((a.arrivalUnix - nowSec) / 60));
    const prev = best.get(key);
    if (prev && prev.etaMin <= etaMin) continue;
    best.set(key, {
      key,
      etaMin,
      source: live.has(a.tripId) ? "live" : "predicted",
      routeId: a.routeId,
      tripId: a.tripId,
      stopId: a.stopId,
    });
  }
  return best;
}
