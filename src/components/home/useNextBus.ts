// Real-data feed for the Sky Clock home card and the two nearby-line tiles.
//
// Source of truth, in order:
//   1. The realtime snapshot (`useRealtime`, /api/public/realtime every 20 s),
//      run through Smart ETA v2 + the shared freshness classifier — the same
//      pipeline the stop page and the old nearby-stop cards use.
//   2. When the snapshot has nothing for the rider's stops (feed error, or no
//      trip updates yet), the offline timetable the rider downloaded on Saved
//      (IndexedDB). Shown as "Scheduled". If that is empty too, the card says so.
// Nothing here is invented: no time, line or vehicle position is ever filled in.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRealtime } from "@/lib/useRealtime";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { smartEtaV2 } from "@/lib/eta-v2";
import { getShapeForTripSync } from "@/lib/shapes";
import { getHeadsignSync, onHeadsignsLoaded, prefetchHeadsigns } from "@/lib/headsigns";
import { getRoute, getStop, nearestStops, distanceKm } from "@/lib/gtfs";
import {
  getOfflineDeparturesForStop,
  getTripMeta,
  isIndexedDbSupported,
} from "@/lib/offline-timetable-db";
import {
  backingFor,
  viaFromLongName,
  walkMinutes,
  type NearbyLine,
  type NextBus,
} from "./sky-state";

const MAX_ETA_MIN = 120;
const MAX_STOP_KM = 1.2;
const CANDIDATES = 6;
const LIVE_PING_SEC = 90;

type Coords = { lat: number; lng: number };

function shortStopName(name: string) {
  return name.split(/\s[-–]\s|[·,]/)[0].trim();
}

function colorOf(routeId: string) {
  const c = getRoute(routeId)?.color;
  return c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : "#5B6B7A";
}

export function useNextBus(opts: {
  coords: Coords;
  located: boolean;
  pickedStopId: string | null;
}) {
  const { coords, located, pickedStopId } = opts;
  const rt = useRealtime();
  const snap = rt.data;

  const [headsignsReady, setHeadsignsReady] = useState(0);
  useEffect(() => {
    prefetchHeadsigns();
    return onHeadsignsLoaded(() => setHeadsignsReady((n) => n + 1));
  }, []);

  const candidates = useMemo(() => {
    if (pickedStopId) {
      const s = getStop(pickedStopId);
      if (!s) return [];
      return [{ ...s, distanceKm: located ? distanceKm(coords, s) : NaN }];
    }
    if (!located) return [];
    return nearestStops(coords, CANDIDATES).filter(
      (s, i) => i === 0 || s.distanceKm <= MAX_STOP_KM,
    );
  }, [coords, located, pickedStopId]);

  const candidateIds = useMemo(() => candidates.map((s) => s.id), [candidates]);
  const { data: learnedByStop } = useLearnedStatsBulk(candidateIds);

  const live = useMemo(() => {
    if (!snap || candidates.length === 0)
      return { bus: null as NextBus | null, tiles: [] as NearbyLine[] };
    const now = Math.floor(Date.now() / 1000);
    const ghost = new Set(snap.ghostTripIds ?? []);
    const vehByTrip = new Map(snap.vehicles.map((v) => [v.tripId, v]));

    let bus: NextBus | null = null;
    const tileCands: (NearbyLine & { dist: number })[] = [];

    for (const s of candidates) {
      const walkSec = Number.isFinite(s.distanceKm) ? walkMinutes(s.distanceKm) * 60 : 0;
      // Arrivals the rider can still make on foot.
      const catchable = snap.arrivals.filter(
        (a) =>
          a.stopId === s.id &&
          a.arrivalUnix >= now + walkSec - 60 &&
          a.arrivalUnix - now <= MAX_ETA_MIN * 60,
      );
      if (catchable.length === 0) continue;
      catchable.sort((a, b) => a.arrivalUnix - b.arrivalUnix);
      const drop = new Set(
        snap.arrivals
          .filter((a) => a.stopId === s.id && !catchable.includes(a))
          .map((a) => a.tripId),
      );
      const arrivals = snap.arrivals.filter((a) => !(a.stopId === s.id && drop.has(a.tripId)));

      if (!bus) {
        // Smart ETA can pull a bus earlier than the operator said; if it then
        // arrives before the rider can walk there, move on to the next one.
        let pick: { idx: number; smart: ReturnType<typeof smartEtaV2> } | null = null;
        for (let k = 0; k < Math.min(3, catchable.length); k++) {
          const cand = catchable[k];
          const skipped = new Set(catchable.slice(0, k).map((c) => c.tripId));
          const pool = arrivals.filter((a) => !(a.stopId === s.id && skipped.has(a.tripId)));
          const sm = smartEtaV2({
            stopId: s.id,
            arrivals: pool,
            vehicles: snap.vehicles,
            nowSec: now,
            agency: s.agency,
            learnedByRoute: learnedByStop?.get(s.id),
            shape: getShapeForTripSync(cand.tripId, cand.routeId),
            riderConfirmedAgeSec: rt.riderConfirmedAge.get(cand.tripId),
            riderConfirmedSources: rt.riderConfirmedCount.get(cand.tripId),
          });
          if (!sm || sm.etaSec >= walkSec - 60) {
            pick = { idx: k, smart: sm };
            break;
          }
        }
        if (pick) {
          const next = catchable[pick.idx];
          const smart = pick.smart;
          const nextIdx = pick.idx;
          const route = getRoute(next.routeId);
          const dest =
            getHeadsignSync(next.tripId, next.routeId) ?? route?.long?.split(/\s+-\s+/).pop() ?? "";
          const backing = backingFor(smart?.tier);
          const etaSec = smart ? smart.etaSec : Math.max(0, next.arrivalUnix - now);
          const arrivalUnix = now + Math.round(etaSec);
          const hasVehicle = vehByTrip.has(next.tripId) && !ghost.has(next.tripId);
          const sameDir = (tripId: string, routeId: string) =>
            routeId === next.routeId && (getHeadsignSync(tripId, routeId) ?? dest) === dest;
          bus = {
            stopId: s.id,
            stopName: shortStopName(s.name),
            walkMin: Number.isFinite(s.distanceKm) ? walkMinutes(s.distanceKm) : null,
            walkSec,
            stopLat: s.lat,
            stopLng: s.lng,
            tripId: next.tripId,
            routeId: next.routeId,
            line: route?.short ?? "-",
            color: colorOf(next.routeId),
            dest,
            via: viaFromLongName(route?.long, dest),
            etaMin: Math.max(0, Math.round(etaSec / 60)),
            arrivalUnix,
            backing,
            stopsAway:
              backing === "live" && hasVehicle && smart && smart.stopsAway > 0
                ? smart.stopsAway
                : null,
            then: catchable
              .slice(nextIdx + 1)
              .filter((a) => a.tripId !== next.tripId && sameDir(a.tripId, a.routeId))
              .slice(0, 2)
              .map((a) => a.arrivalUnix),
            source: "realtime",
          };
        }
      }

      for (const a of catchable) {
        if (bus && a.routeId === bus.routeId) continue;
        const v = vehByTrip.get(a.tripId);
        const isLive = !!v && !ghost.has(a.tripId) && now - v.timestamp <= LIVE_PING_SEC;
        tileCands.push({
          stopId: s.id,
          routeId: a.routeId,
          line: getRoute(a.routeId)?.short ?? "-",
          color: colorOf(a.routeId),
          dest:
            getHeadsignSync(a.tripId, a.routeId) ??
            getRoute(a.routeId)
              ?.long?.split(/\s+-\s+/)
              .pop() ??
            "",
          etaMin: Math.max(0, Math.round((a.arrivalUnix - now) / 60)),
          live: isLive,
          dist: s.distanceKm,
        });
      }
    }

    const seen = new Set<string>();
    const tiles = tileCands
      .sort((a, b) => a.etaMin - b.etaMin)
      .filter((t) => {
        const k = `${t.routeId}|${t.dest}`;
        if (seen.has(k) || seen.has(t.routeId)) return false;
        seen.add(k);
        seen.add(t.routeId);
        return true;
      })
      .slice(0, 2)
      .map(({ dist: _d, ...t }) => t);

    return { bus, tiles };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    snap,
    candidates,
    learnedByStop,
    rt.riderConfirmedAge,
    rt.riderConfirmedCount,
    headsignsReady,
  ]);

  // Offline timetable fallback, only when realtime gave us nothing for these stops.
  const needOffline = candidates.length > 0 && !live.bus && (!!snap || rt.isError);
  const offline = useQuery({
    queryKey: ["home-offline-next", candidateIds.slice(0, 3).join(",")],
    enabled: needOffline && typeof window !== "undefined" && isIndexedDbSupported(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NextBus | null> => {
      const now = new Date();
      const nowUnix = Math.floor(now.getTime() / 1000);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
      for (const s of candidates.slice(0, 3)) {
        const walkSec = Number.isFinite(s.distanceKm) ? walkMinutes(s.distanceKm) * 60 : 0;
        const deps = (await getOfflineDeparturesForStop(s.id, undefined, undefined, 12))
          .map((d) => ({ ...d, unix: midnight + d.departureSec }))
          .filter((d) => d.unix >= nowUnix + walkSec - 60 && d.unix - nowUnix <= MAX_ETA_MIN * 60);
        if (deps.length === 0) continue;
        const next = deps[0];
        const meta = await getTripMeta(next.tripId);
        const route = getRoute(next.routeId);
        const dest = meta?.headsign ?? route?.long?.split(/\s+-\s+/).pop() ?? "";
        return {
          stopId: s.id,
          stopName: shortStopName(s.name),
          walkMin: Number.isFinite(s.distanceKm) ? walkMinutes(s.distanceKm) : null,
          walkSec,
          stopLat: s.lat,
          stopLng: s.lng,
          tripId: next.tripId,
          routeId: next.routeId,
          line: route?.short ?? "-",
          color: colorOf(next.routeId),
          dest,
          via: viaFromLongName(route?.long, dest),
          etaMin: Math.max(0, Math.round((next.unix - nowUnix) / 60)),
          arrivalUnix: next.unix,
          backing: "scheduled",
          stopsAway: null,
          then: deps
            .slice(1)
            .filter((d) => d.routeId === next.routeId)
            .slice(0, 2)
            .map((d) => d.unix),
          source: "offline",
        };
      }
      return null;
    },
  });

  const nearest = candidates[0]
    ? { id: candidates[0].id, name: shortStopName(candidates[0].name) }
    : null;

  return {
    bus: live.bus ?? offline.data ?? null,
    tiles: live.tiles,
    nearestStop: nearest,
    rtLoading: rt.isLoading,
    rtError: rt.isError,
    rtHasData: !!snap,
    offlineLoading: needOffline && offline.isLoading && offline.fetchStatus !== "idle",
    refetch: () => void rt.refetch(),
    snapshot: snap,
  };
}
