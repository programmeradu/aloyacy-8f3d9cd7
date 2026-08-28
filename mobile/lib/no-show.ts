import { API_BASE } from "./api";
import type { NoShowSlot } from "@aloya/core/no-show";
import {
  pickHeadwayForDepartures,
  type HeadwayDeparture,
  type HeadwayHint,
  type HeadwayObs,
} from "@aloya/core/headway-chance";

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
