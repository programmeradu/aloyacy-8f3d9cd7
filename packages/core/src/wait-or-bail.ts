// Wait or bail — one action at the stop when the row is dark.
// Same-stop only: a later live bus we can already see. Walk and RAPTOR
// re-plan need a destination; those stay on the journey HUD.

export const WAIT_OR_BAIL_MAX_MIN = 20;
export const WAIT_OR_BAIL_OTHER_MARGIN_MIN = 3;

export type WaitOrBailTier = "live" | "rider-confirmed" | "predicted" | "ghost" | "scheduled";

export type WaitOrBailRow = {
  tripId: string;
  routeId: string;
  routeShort: string;
  headsign?: string | null;
  etaMin: number;
  tier: WaitOrBailTier;
};

export type WaitOrBailFlags = {
  lastTonight: boolean;
  noShow: boolean;
};

export type WaitOrBail =
  | { kind: "skipSame"; routeShort: string; etaMin: number }
  | { kind: "otherRoute"; routeShort: string; altRouteShort: string; etaMin: number }
  | { kind: "bail"; routeShort: string };

const LIVEISH = new Set<WaitOrBailTier>(["live", "rider-confirmed", "predicted"]);
const DARK = new Set<WaitOrBailTier>(["ghost", "scheduled"]);

export function sameWay(a?: string | null, b?: string | null): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function soonest(
  rows: WaitOrBailRow[],
  pred: (r: WaitOrBailRow) => boolean,
): WaitOrBailRow | undefined {
  let best: WaitOrBailRow | undefined;
  for (const r of rows) {
    if (!pred(r)) continue;
    if (!best || r.etaMin < best.etaMin) best = r;
  }
  return best;
}

export function pickWaitOrBail(
  current: WaitOrBailRow,
  rows: WaitOrBailRow[],
  flags: WaitOrBailFlags,
): WaitOrBail | null {
  if (LIVEISH.has(current.tier)) return null;
  if (!DARK.has(current.tier) && !flags.noShow) return null;

  const laterSame = soonest(
    rows,
    (r) =>
      r.tripId !== current.tripId &&
      r.routeId === current.routeId &&
      LIVEISH.has(r.tier) &&
      r.etaMin >= 0 &&
      r.etaMin <= WAIT_OR_BAIL_MAX_MIN &&
      sameWay(r.headsign, current.headsign),
  );
  if (laterSame) {
    return { kind: "skipSame", routeShort: current.routeShort, etaMin: laterSame.etaMin };
  }

  const other = soonest(
    rows,
    (r) =>
      r.routeId !== current.routeId &&
      LIVEISH.has(r.tier) &&
      r.etaMin >= 0 &&
      r.etaMin <= WAIT_OR_BAIL_MAX_MIN &&
      r.etaMin + WAIT_OR_BAIL_OTHER_MARGIN_MIN <= current.etaMin,
  );
  if (other) {
    return {
      kind: "otherRoute",
      routeShort: current.routeShort,
      altRouteShort: other.routeShort,
      etaMin: other.etaMin,
    };
  }

  if (flags.lastTonight && DARK.has(current.tier)) {
    return { kind: "bail", routeShort: current.routeShort };
  }
  return null;
}

/** First dark / no-show row per route. An earlier live bus on that route
 *  already answers the question. */
export function pickWaitOrBailForDepartures(
  rows: WaitOrBailRow[],
  flagsFor: (row: WaitOrBailRow) => WaitOrBailFlags,
): Map<string, WaitOrBail> {
  const out = new Map<string, WaitOrBail>();
  const spoken = new Set<string>();
  const liveSeen = new Set<string>();
  for (const row of rows) {
    if (LIVEISH.has(row.tier)) {
      liveSeen.add(row.routeId);
      continue;
    }
    if (spoken.has(row.routeId) || liveSeen.has(row.routeId)) continue;
    const action = pickWaitOrBail(row, rows, flagsFor(row));
    if (!action) continue;
    out.set(row.tripId, action);
    spoken.add(row.routeId);
  }
  return out;
}

export function waitOrBailCopy(action: WaitOrBail): string {
  switch (action.kind) {
    case "skipSame":
      return `This ${action.routeShort} isn't on the map. The next one is, ${action.etaMin} min.`;
    case "otherRoute":
      return `The ${action.altRouteShort} is on the map, ${action.etaMin} min. This ${action.routeShort} isn't.`;
    case "bail":
      return `This ${action.routeShort} was the last tonight and it isn't on the map. Bolt, a taxi, or tomorrow.`;
  }
}
