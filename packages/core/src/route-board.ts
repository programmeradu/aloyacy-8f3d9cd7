// Pure logic behind the route detail screen (web + native parity).
//
// Takes raw realtime arrivals/vehicles plus a stop lookup and produces the
// board model: ordered trips on the line, the canonical stop sequence, and
// where every reporting bus currently sits along that sequence. Also owns the
// copy for the dark "next departure" hero and the stop-row live labels.

export type BoardArrival = {
  tripId: string;
  routeId: string;
  stopId: string;
  arrivalUnix: number;
};

export type BoardVehicle = {
  id: string;
  tripId: string;
  routeId: string;
  lat: number;
  lng: number;
  speed?: number | null;
};

export type BoardStop = {
  name: string;
  code?: string;
  lat: number;
  lng: number;
};

export type BoardTrip = {
  tripId: string;
  arrivals: BoardArrival[];
  firstStop: BoardArrival;
  lastStop: BoardArrival;
  nextArrival: BoardArrival;
};

export type BusStatus = "at" | "approaching" | "departing";

export type BusOnLine = {
  vehicleId: string;
  tripId: string;
  stopIndex: number;
  status: BusStatus;
  speed: number;
};

export type RouteBoard = {
  trips: BoardTrip[];
  vehicles: BoardVehicle[];
  stopIds: string[];
  longest: BoardTrip | undefined;
  busesOnLine: BusOnLine[];
};

/** Metres between two lat/lng points (equirectangular — fine at stop scale). */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const x = (b.lng - a.lng) * toRad * Math.cos(((a.lat + b.lat) / 2) * toRad);
  const y = (b.lat - a.lat) * toRad;
  return Math.sqrt(x * x + y * y) * R;
}

/** A bus within this many metres of a stop counts as standing at it. */
export const AT_STOP_METRES = 120;

export function buildRouteBoard(input: {
  routeId: string;
  arrivals: readonly BoardArrival[];
  vehicles: readonly BoardVehicle[];
  stopOf: (id: string) => BoardStop | undefined;
  nowSec?: number;
}): RouteBoard {
  const { routeId, arrivals, vehicles: allVehicles, stopOf } = input;
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);

  const tripMap = new Map<string, BoardArrival[]>();
  for (const a of arrivals) {
    if (a.routeId !== routeId) continue;
    const list = tripMap.get(a.tripId);
    if (list) list.push(a);
    else tripMap.set(a.tripId, [a]);
  }

  const trips: BoardTrip[] = Array.from(tripMap.entries())
    .map(([tripId, arrs]) => {
      const sorted = [...arrs].sort((x, y) => x.arrivalUnix - y.arrivalUnix);
      const upcoming =
        sorted.find((s) => s.arrivalUnix >= now - 30) ?? sorted[sorted.length - 1];
      return {
        tripId,
        arrivals: sorted,
        firstStop: sorted[0],
        lastStop: sorted[sorted.length - 1],
        nextArrival: upcoming,
      };
    })
    .sort((a, b) => a.nextArrival.arrivalUnix - b.nextArrival.arrivalUnix);

  const vehicles = allVehicles.filter((v) => v.routeId === routeId);

  const longest = trips.reduce<BoardTrip | undefined>(
    (best, t) => (t.arrivals.length > (best?.arrivals.length ?? 0) ? t : best),
    trips[0],
  );
  const stopIds = longest
    ? Array.from(new Set(longest.arrivals.map((a) => a.stopId)))
    : [];

  const busesOnLine: BusOnLine[] = [];
  for (const v of vehicles) {
    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < stopIds.length; i++) {
      const stop = stopOf(stopIds[i]);
      if (!stop) continue;
      const d = metresBetween({ lat: v.lat, lng: v.lng }, stop);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }
    if (nearestIdx === -1) continue;

    if (nearestDist < AT_STOP_METRES) {
      const isOrigin = nearestIdx === 0;
      busesOnLine.push({
        vehicleId: v.id,
        tripId: v.tripId,
        stopIndex: nearestIdx,
        status: isOrigin && (v.speed ?? 0) < 1 ? "departing" : "at",
        speed: v.speed ?? 0,
      });
    } else {
      const nextScheduled = [...(tripMap.get(v.tripId) ?? [])]
        .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
        .find((a) => a.arrivalUnix >= now - 30);
      const targetIdx = nextScheduled ? stopIds.indexOf(nextScheduled.stopId) : -1;
      busesOnLine.push({
        vehicleId: v.id,
        tripId: v.tripId,
        stopIndex: targetIdx >= 0 ? targetIdx : nearestIdx,
        status: "approaching",
        speed: v.speed ?? 0,
      });
    }
  }

  return { trips, vehicles, stopIds, longest, busesOnLine };
}

/** "14:07" in Cyprus-friendly 24h form. */
export function boardClock(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Due" / "7 min" / "1h 12m" — never a bare negative. */
export function minutesFromNow(unixSec: number, nowMs = Date.now()): string {
  const m = Math.round((unixSec - nowMs / 1000) / 60);
  if (m <= 0) return "Due";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function isIntercityRoute(
  meta: { feedId?: number; short?: string } | undefined,
): boolean {
  if (!meta) return false;
  return meta.feedId === 6 || /^IC/i.test(meta.short ?? "");
}

/** Headline meta line under the route title. */
export function routeSummaryLine(board: RouteBoard | null): string {
  const buses = board?.vehicles.length ?? 0;
  const head =
    buses === 0
      ? "No buses reporting right now"
      : buses === 1
        ? "1 bus running now"
        : `${buses} buses running now`;
  const stops = board?.stopIds.length ?? 0;
  return stops ? `${head}  ·  ${stops} stops on line` : head;
}

/** Terminus label for a run row: first segment of the stop name, uppercased by the view. */
export function terminusLabel(name: string | undefined): string {
  if (!name) return "Terminus";
  const head = name.split(/[·\-,]/)[0]?.trim();
  return head && head.length > 0 ? head : "Terminus";
}

/** Live label for a stop row, or null when nothing is reporting there. */
export function stopRowLabel(input: {
  index: number;
  total: number;
  code?: string;
  buses: readonly BusOnLine[];
}): { label: string; live: boolean } {
  const here = input.buses.find(
    (b) => b.stopIndex === input.index && (b.status === "at" || b.status === "departing"),
  );
  const approaching = input.buses.find(
    (b) => b.stopIndex === input.index && b.status === "approaching",
  );
  if (here) {
    return {
      label: here.status === "departing" ? "BUS DEPARTING NOW" : "BUS AT THIS STOP",
      live: true,
    };
  }
  if (approaching) return { label: "BUS APPROACHING", live: true };

  const position =
    input.index === 0
      ? "ORIGIN"
      : input.index === input.total - 1
        ? "TERMINUS"
        : `STOP ${input.index + 1}`;
  return { label: position + (input.code ? `  ·  #${input.code}` : ""), live: false };
}

export type DepartureCopy = {
  kicker: string;
  headline: string;
  footer: string;
  pill: string;
  isLive: boolean;
};

/** Copy for the dark next-departure hero, live-bus aware. */
export function nextDepartureCopy(input: {
  nextStopName: string | undefined;
  terminusName: string | undefined;
  arrivalUnix: number;
  liveBus?: Pick<BusOnLine, "status" | "speed" | "stopIndex"> | null;
  liveBusStopName?: string;
  nowMs?: number;
}): DepartureCopy {
  const nextStopName = input.nextStopName ?? "Upcoming stop";
  const terminusName = input.terminusName ?? "Terminus";
  const clock = boardClock(input.arrivalUnix);

  if (!input.liveBus) {
    return {
      kicker: "NEXT DEPARTURE",
      headline: nextStopName,
      footer: `Ends ${terminusName}  ·  ${clock}`,
      pill: minutesFromNow(input.arrivalUnix, input.nowMs).toUpperCase(),
      isLive: false,
    };
  }

  const atStop = input.liveBusStopName ?? nextStopName;
  if (input.liveBus.status === "departing") {
    return {
      kicker: "ABOUT TO DEPART",
      headline: atStop,
      footer: `Boarding now  ·  Ends ${terminusName}`,
      pill: "BOARDING",
      isLive: true,
    };
  }
  if (input.liveBus.status === "at") {
    return {
      kicker: "BUS AT STOP",
      headline: atStop,
      footer: `Doors open  ·  Then ${nextStopName}`,
      pill: "AT STOP",
      isLive: true,
    };
  }

  const kmh = Math.round((input.liveBus.speed ?? 0) * 3.6);
  return {
    kicker: kmh > 3 ? "BUS IN MOTION" : "BUS EN ROUTE",
    headline: `Heading to ${nextStopName}`,
    footer:
      (kmh > 3 ? `${kmh} km/h  ·  ` : "") +
      `Arrives ${clock}  ·  Ends ${terminusName}`,
    pill: minutesFromNow(input.arrivalUnix, input.nowMs).toUpperCase(),
    isLive: true,
  };
}
