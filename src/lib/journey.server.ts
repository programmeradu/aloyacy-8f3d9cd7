// Door-to-door journey planner.
// Two-pass design:
//   1. LIVE pass — use realtime tripUpdates to compose options with exact
//      times. Highest quality.
//   2. STATIC pass — fall back to baked GTFS route topology so any route
//      that *can* connect origin to destination is surfaced, even when no
//      trip from that route is currently in the live feed window. Marked
//      `scheduled: true` so the UI can soften the time copy.
//
// Plus: direct-route bias — options that land you closer to the destination
// outrank options that dump you a 4-min walk away on the same fare.
// Plus: hub-tight alighting — when the destination is a named bus station /
// terminal / interchange, only accept alight stops within ~200 m so a stop
// "near the station" never beats the station itself.

import { fetchRealtime } from "./gtfs-rt.server";
import { STOPS, ROUTES, distanceKm } from "./gtfs";
import { walkingRoute } from "./maps.server";
import ROUTE_SEQUENCES from "../data/route_sequences.json";
import ROUTES_META from "../data/routes_meta.json";

const WALK_M_PER_S = 1.35;
const MAX_WALK_KM = 1.2;
const HUB_ALIGHT_KM = 0.2; // 200 m when destination is a named hub
const TOP_STOPS = 8;
const HUB_RE = /\b(station|terminal|interchange|airport|port|depot|stadium)\b/i;

type RouteSequences = Record<string, string[]>;
type RoutesMeta = Record<string, { short: string; long: string; color: string }>;
const SEQUENCES = ROUTE_SEQUENCES as RouteSequences;
const META = ROUTES_META as RoutesMeta;

export type JourneyLeg =
  | {
      kind: "walk";
      from: { lat: number; lng: number; label: string };
      to: { lat: number; lng: number; label: string };
      durationSec: number;
      distanceMeters: number;
    }
  | {
      kind: "bus";
      routeId: string;
      routeShort: string;
      routeLong: string;
      tripId: string;
      board: { stopId: string; name: string; departureUnix: number };
      alight: { stopId: string; name: string; arrivalUnix: number };
      delaySec: number;
      /** True when this option came from the static schedule, not the live
       *  feed — times are best-effort placeholders. */
      scheduled?: boolean;
    };

export type JourneyOption = {
  id: string;
  totalDurationSec: number;
  departureUnix: number;
  arrivalUnix: number;
  legs: JourneyLeg[];
  transfers: number;
  scheduled?: boolean;
};

function walkSecondsFallback(km: number) {
  return Math.round((km * 1000) / WALK_M_PER_S);
}

function looksLikeHub(label: string | undefined) {
  return !!label && HUB_RE.test(label);
}

export async function planJourney(
  from: { lat: number; lng: number; label?: string },
  to: { lat: number; lng: number; label?: string },
): Promise<JourneyOption[]> {
  const now = Math.floor(Date.now() / 1000);
  const destIsHub = looksLikeHub(to.label);

  // 1. Candidate boarding / alighting stops within walking radius.
  const originStops = STOPS.map((s) => ({
    ...s,
    distanceKm: distanceKm(from, s),
  }))
    .filter((s) => s.distanceKm <= MAX_WALK_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, TOP_STOPS);

  // Hubs: only accept alight stops very close to the destination point AND
  // whose own name matches the hub (so "Strovolos Bus Station" doesn't
  // accept "Ave. Strovolou – Kantaras" 250 m away). Plus the named hub stop
  // itself if its name shares a strong keyword with the destination label.
  const alightRadius = destIsHub ? HUB_ALIGHT_KM : MAX_WALK_KM;
  const destStops = STOPS.map((s) => ({
    ...s,
    distanceKm: distanceKm(to, s),
  }))
    .filter((s) => {
      if (s.distanceKm > MAX_WALK_KM) return false;
      if (!destIsHub) return s.distanceKm <= MAX_WALK_KM;
      // Hub mode: accept stops within tight radius, OR any stop whose own
      // name is itself a hub within the broader 600 m window.
      if (s.distanceKm <= alightRadius) return true;
      if (s.distanceKm <= 0.6 && HUB_RE.test(s.name)) return true;
      return false;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, TOP_STOPS);

  if (originStops.length === 0 || destStops.length === 0) return [];

  const originIds = new Set(originStops.map((s) => s.id));
  const destIds = new Set(destStops.map((s) => s.id));
  const originDistById = new Map(originStops.map((s) => [s.id, s.distanceKm]));
  const destDistById = new Map(destStops.map((s) => [s.id, s.distanceKm]));

  // 2. Pull live feed and index arrivals by trip.
  const rt = await fetchRealtime();
  const byTrip = new Map<
    string,
    {
      routeId: string;
      stops: { stopId: string; arrivalUnix: number; delaySec: number }[];
    }
  >();
  for (const a of rt.arrivals) {
    if (a.arrivalUnix < now - 60) continue;
    const cur = byTrip.get(a.tripId) ?? { routeId: a.routeId, stops: [] };
    cur.stops.push({
      stopId: a.stopId,
      arrivalUnix: a.arrivalUnix,
      delaySec: a.delaySec,
    });
    byTrip.set(a.tripId, cur);
  }

  const routeById = new Map(ROUTES.map((r) => [r.id, r]));
  const stopById = new Map(STOPS.map((s) => [s.id, s]));

  function routeLabel(routeId: string) {
    const r = routeById.get(routeId);
    if (r) return { short: r.short, long: r.long };
    const m = META[routeId];
    return { short: m?.short ?? "?", long: m?.long ?? "Route" };
  }

  // 3. LIVE pass — trips that visibly serve origin then destination.
  const candidates: JourneyOption[] = [];
  const liveCoverage = new Set<string>(); // routeId|boardStop|alightStop

  for (const [tripId, trip] of byTrip) {
    const ordered = [...trip.stops].sort((a, b) => a.arrivalUnix - b.arrivalUnix);
    const boardIdx = ordered.findIndex((s) => originIds.has(s.stopId));
    if (boardIdx === -1) continue;
    const alightIdx = ordered.findIndex(
      (s, i) => i > boardIdx && destIds.has(s.stopId),
    );
    if (alightIdx === -1) continue;

    const board = ordered[boardIdx];
    const alight = ordered[alightIdx];
    const boardStop = stopById.get(board.stopId);
    const alightStop = stopById.get(alight.stopId);
    if (!boardStop || !alightStop) continue;
    const { short, long } = routeLabel(trip.routeId);

    const walkAKm = distanceKm(from, boardStop);
    const walkBKm = distanceKm(alightStop, to);
    const walkASec = walkSecondsFallback(walkAKm);
    const walkBSec = walkSecondsFallback(walkBKm);
    const waitSec = Math.max(0, board.arrivalUnix - now - walkASec);

    if (board.arrivalUnix - now < walkASec - 60) continue;

    const departureUnix = now + walkASec + waitSec;
    const arrivalUnix = alight.arrivalUnix + walkBSec;
    const totalDurationSec = arrivalUnix - now;

    liveCoverage.add(`${trip.routeId}|${board.stopId}|${alight.stopId}`);

    candidates.push({
      id: `live-${tripId}-${board.stopId}-${alight.stopId}`,
      totalDurationSec,
      departureUnix,
      arrivalUnix,
      transfers: 0,
      legs: [
        {
          kind: "walk",
          from: { lat: from.lat, lng: from.lng, label: from.label ?? "Origin" },
          to: { lat: boardStop.lat, lng: boardStop.lng, label: boardStop.name },
          durationSec: walkASec,
          distanceMeters: Math.round(walkAKm * 1000),
        },
        {
          kind: "bus",
          routeId: trip.routeId,
          routeShort: short,
          routeLong: long,
          tripId,
          board: {
            stopId: boardStop.id,
            name: boardStop.name,
            departureUnix: board.arrivalUnix,
          },
          alight: {
            stopId: alightStop.id,
            name: alightStop.name,
            arrivalUnix: alight.arrivalUnix,
          },
          delaySec: board.delaySec,
        },
        {
          kind: "walk",
          from: { lat: alightStop.lat, lng: alightStop.lng, label: alightStop.name },
          to: { lat: to.lat, lng: to.lng, label: to.label ?? "Destination" },
          durationSec: walkBSec,
          distanceMeters: Math.round(walkBKm * 1000),
        },
      ],
    });
  }

  // 4. STATIC pass — for every (route, direction) topology, see if an
  // origin-near stop precedes a dest-near stop in the sequence. Add as a
  // scheduled candidate if not already covered by the live pass. Estimated
  // times: walk + a soft 12 min wait so the UI sorts these after live picks.
  const SCHEDULED_WAIT_SEC = 12 * 60;
  const RIDE_AVG_KMH = 22;

  for (const [key, sequence] of Object.entries(SEQUENCES)) {
    const [routeId] = key.split("|");
    // First origin-near stop, then earliest dest-near stop after it.
    let boardIdx = -1;
    let alightIdx = -1;
    for (let i = 0; i < sequence.length; i++) {
      const sid = sequence[i];
      if (boardIdx === -1 && originIds.has(sid)) {
        boardIdx = i;
        continue;
      }
      if (boardIdx !== -1 && destIds.has(sid)) {
        alightIdx = i;
        break;
      }
    }
    if (boardIdx === -1 || alightIdx === -1) continue;

    const boardStopId = sequence[boardIdx];
    const alightStopId = sequence[alightIdx];
    if (liveCoverage.has(`${routeId}|${boardStopId}|${alightStopId}`)) continue;

    const boardStop = stopById.get(boardStopId);
    const alightStop = stopById.get(alightStopId);
    if (!boardStop || !alightStop) continue;

    const walkAKm = distanceKm(from, boardStop);
    const walkBKm = distanceKm(alightStop, to);
    const walkASec = walkSecondsFallback(walkAKm);
    const walkBSec = walkSecondsFallback(walkBKm);
    const rideKm = distanceKm(boardStop, alightStop) * 1.3; // road factor
    const rideSec = Math.round((rideKm / RIDE_AVG_KMH) * 3600);

    const departureUnix = now + walkASec + SCHEDULED_WAIT_SEC;
    const boardArrivalUnix = departureUnix;
    const alightArrivalUnix = boardArrivalUnix + rideSec;
    const arrivalUnix = alightArrivalUnix + walkBSec;

    const { short, long } = routeLabel(routeId);

    candidates.push({
      id: `sched-${routeId}-${boardStopId}-${alightStopId}`,
      totalDurationSec: arrivalUnix - now,
      departureUnix,
      arrivalUnix,
      transfers: 0,
      scheduled: true,
      legs: [
        {
          kind: "walk",
          from: { lat: from.lat, lng: from.lng, label: from.label ?? "Origin" },
          to: { lat: boardStop.lat, lng: boardStop.lng, label: boardStop.name },
          durationSec: walkASec,
          distanceMeters: Math.round(walkAKm * 1000),
        },
        {
          kind: "bus",
          routeId,
          routeShort: short,
          routeLong: long,
          tripId: `sched-${routeId}`,
          board: {
            stopId: boardStop.id,
            name: boardStop.name,
            departureUnix: boardArrivalUnix,
          },
          alight: {
            stopId: alightStop.id,
            name: alightStop.name,
            arrivalUnix: alightArrivalUnix,
          },
          delaySec: 0,
          scheduled: true,
        },
        {
          kind: "walk",
          from: { lat: alightStop.lat, lng: alightStop.lng, label: alightStop.name },
          to: { lat: to.lat, lng: to.lng, label: to.label ?? "Destination" },
          durationSec: walkBSec,
          distanceMeters: Math.round(walkBKm * 1000),
        },
      ],
    });
  }

  // 5. Dedupe per (route, board, alight) — soonest live first, scheduled last.
  const bestPerKey = new Map<string, JourneyOption>();
  for (const c of candidates) {
    const bus = c.legs.find((l) => l.kind === "bus");
    if (!bus || bus.kind !== "bus") continue;
    const key = `${bus.routeId}-${bus.board.stopId}-${bus.alight.stopId}`;
    const existing = bestPerKey.get(key);
    if (!existing) {
      bestPerKey.set(key, c);
      continue;
    }
    // Prefer non-scheduled over scheduled.
    const newScore = (c.scheduled ? 1 : 0) * 1e9 + c.departureUnix;
    const exScore =
      (existing.scheduled ? 1 : 0) * 1e9 + existing.departureUnix;
    if (newScore < exScore) bestPerKey.set(key, c);
  }

  // 6. Directness score — penalise long alighting walks heavily so options
  // that land at the hub itself outrank ones that dump you a block away.
  function directnessPenaltySec(o: JourneyOption) {
    const bus = o.legs.find((l) => l.kind === "bus");
    if (!bus || bus.kind !== "bus") return 0;
    const alightWalkKm = destDistById.get(bus.alight.stopId) ?? 0;
    // 1 km away ≈ +12 min penalty, scales with hub-ness.
    const factor = destIsHub ? 1200 : 600;
    return Math.round(alightWalkKm * factor);
  }
  function score(o: JourneyOption) {
    return o.totalDurationSec + directnessPenaltySec(o) + (o.scheduled ? 60 : 0);
  }

  // Diversity: keep up to 4, ensuring distinct routeIds where possible.
  const sorted = [...bestPerKey.values()].sort((a, b) => score(a) - score(b));
  const picked: JourneyOption[] = [];
  const seenRoutes = new Set<string>();
  for (const o of sorted) {
    const bus = o.legs.find((l) => l.kind === "bus");
    if (!bus || bus.kind !== "bus") continue;
    if (seenRoutes.has(bus.routeId)) continue;
    picked.push(o);
    seenRoutes.add(bus.routeId);
    if (picked.length >= 4) break;
  }
  // Fill any remaining slots with next-best repeats.
  if (picked.length < 4) {
    for (const o of sorted) {
      if (picked.includes(o)) continue;
      picked.push(o);
      if (picked.length >= 4) break;
    }
  }

  // 7. Upgrade walking legs with real Google geometry.
  await Promise.all(
    picked.map(async (opt) => {
      for (const leg of opt.legs) {
        if (leg.kind !== "walk") continue;
        const real = await walkingRoute(
          { lat: leg.from.lat, lng: leg.from.lng },
          { lat: leg.to.lat, lng: leg.to.lng },
        );
        if (real) {
          leg.durationSec = real.durationSec;
          leg.distanceMeters = real.distanceMeters;
        }
      }
      const first = opt.legs[0];
      const last = opt.legs[opt.legs.length - 1];
      const bus = opt.legs.find((l) => l.kind === "bus");
      if (first?.kind === "walk" && last?.kind === "walk" && bus?.kind === "bus") {
        const waitSec = Math.max(
          0,
          bus.board.departureUnix - now - first.durationSec,
        );
        opt.departureUnix = now + first.durationSec + waitSec;
        opt.arrivalUnix = bus.alight.arrivalUnix + last.durationSec;
        opt.totalDurationSec = opt.arrivalUnix - now;
      }
    }),
  );

  // Stable user-facing ordering: by total duration with directness factored in.
  return picked.sort((a, b) => score(a) - score(b));
}

// Re-export for client use (kept stable for legacy imports).
export { WALK_M_PER_S };
