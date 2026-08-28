// Next departure per agency:short, from the same snapshot the rider sees.

import { fetchRealtime } from "@/lib/gtfs-rt.server";
import { getRoute } from "@/lib/gtfs";
import { parseBoardQuery, pickBoardRows, type BoardRow } from "@aloya/core/board-pick";

export async function loadBoard(q: string, nowSec = Math.floor(Date.now() / 1000)) {
  const keys = parseBoardQuery(q);
  const snap = await fetchRealtime();
  const liveTripIds = [
    ...snap.vehicles.map((v) => v.tripId),
    ...(snap.riderConfirmedTrips ?? []).map((r) => r.tripId),
  ];
  const rows = pickBoardRows(
    keys,
    snap.arrivals,
    liveTripIds,
    snap.ghostTripIds ?? [],
    (id) => {
      const r = getRoute(id);
      return r ? { short: r.short, agency: r.agency } : undefined;
    },
    nowSec,
  );
  const out: Record<string, BoardRow> = {};
  for (const [k, v] of rows) out[k] = v;
  return {
    fetchedAt: snap.fetchedAt,
    stale: snap.stale === true,
    rows: out,
  };
}
