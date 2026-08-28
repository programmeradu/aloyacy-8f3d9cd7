import { API_BASE } from "./api";
import type { NoShowSlot } from "@aloya/core/no-show";
import { lastTonightOnRoute, pickNoShow } from "@aloya/core/no-show";
import {
  pickHeadwayForDepartures,
  type HeadwayDeparture,
  type HeadwayHint,
  type HeadwayObs,
} from "@aloya/core/headway-chance";
import {
  pickWaitOrBailForDepartures,
  type WaitOrBail,
  type WaitOrBailRow,
} from "@aloya/core/wait-or-bail";
import { getHeadsignSync } from "./headsigns";

export type StopRunHints = { slots: NoShowSlot[]; headways: HeadwayObs[] };

export async function fetchStopRunHints(
  routeIds: string[],
  stopId: string,
): Promise<StopRunHints> {
  if (routeIds.length === 0) return { slots: [], headways: [] };
  const res = await fetch(`${API_BASE}/api/public/stop-run-hints`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ routeIds: routeIds.slice(0, 30), stopId }),
  });
  if (!res.ok) throw new Error(`Stop-run hints ${res.status}`);
  const body = (await res.json()) as Partial<StopRunHints>;
  return { slots: body.slots ?? [], headways: body.headways ?? [] };
}

export function headwaysForStop(
  deps: HeadwayDeparture[],
  hints: StopRunHints | undefined,
  rt:
    | {
        vehicles: { routeId: string; timestamp: number }[];
        arrivals: { stopId: string; routeId: string; arrivalUnix: number }[];
      }
    | undefined,
  stopId: string,
): Map<string, HeadwayHint> {
  if (!rt || !hints) return new Map();
  return pickHeadwayForDepartures(
    deps,
    hints.headways,
    rt.vehicles,
    rt.arrivals,
    stopId,
    Math.floor(Date.now() / 1000),
  );
}

export function waitOrBailForStop(
  deps: Array<{
    tripId: string;
    routeId: string;
    arrivalUnix: number;
    eta: { etaMin: number; tier: WaitOrBailRow["tier"] };
  }>,
  routeMeta: Record<string, { short?: string }> | undefined,
  rt: { arrivals: { stopId: string; routeId: string; arrivalUnix: number }[] } | undefined,
  slots: NoShowSlot[],
  stopId: string,
): Map<string, WaitOrBail> {
  if (deps.length === 0) return new Map();
  const nowMs = Date.now();
  return pickWaitOrBailForDepartures(
    deps.map((d) => ({
      tripId: d.tripId,
      routeId: d.routeId,
      routeShort: routeMeta?.[d.routeId]?.short ?? "?",
      headsign: getHeadsignSync(d.tripId, d.routeId),
      etaMin: d.eta.etaMin,
      tier: d.eta.tier,
    })),
    (row) => {
      const d = deps.find((x) => x.tripId === row.tripId);
      if (!d) return { lastTonight: false, noShow: false };
      return {
        lastTonight: rt ? lastTonightOnRoute(rt.arrivals, stopId, d.routeId, d.arrivalUnix) : false,
        noShow: !!pickNoShow(slots, d.routeId, d.arrivalUnix, nowMs),
      };
    },
  );
}
