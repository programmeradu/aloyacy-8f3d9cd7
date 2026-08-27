import { useEffect, useMemo, useState } from "react";
import { getShapeForTripSync } from "@/lib/shapes";
import { getHeadsignSync, onHeadsignsLoaded, prefetchHeadsigns } from "@/lib/headsigns";
import { smartEtaV2 } from "@/lib/eta-v2";
import { useLearnedStatsBulk } from "@/lib/useLearnedStatsBulk";
import { useRealtime } from "@/lib/useRealtime";
import { getRoute, nearestStops, routeTone, stopKind } from "@/lib/gtfs";
import { getStopAmenities } from "@/data/stop-amenities";
import { useI18n } from "@/lib/i18n";
import type { Stop } from "@/components/StopCard";
import { sampleEtaPrediction } from "@/lib/eta-log";

const MAX_ETA_MIN = 120;

/**
 * Nearby stop cards for the home screen: static proximity + live arrivals,
 * reconciled through Smart ETA v2 and labelled with real headsigns so the two
 * directions of one line never look identical.
 */
export function useNearbyStops(coords: { lat: number; lng: number }, count = 5) {
  const { t: tt } = useI18n();
  const { data: rt, riderConfirmedAge } = useRealtime();

  const nearStops = useMemo(() => nearestStops(coords, count), [coords, count]);
  const nearStopIds = useMemo(() => nearStops.map((s) => s.id), [nearStops]);
  const { data: learnedByStop } = useLearnedStatsBulk(nearStopIds);

  // The headsign bundle loads lazily; bump a counter when it lands so chips
  // re-label from "19" to "19 → Lakatamia" without a full refetch.
  const [headsignsReady, setHeadsignsReady] = useState(0);
  useEffect(() => {
    prefetchHeadsigns();
    return onHeadsignsLoaded(() => setHeadsignsReady((n) => n + 1));
  }, []);

  const cards = useMemo<Stop[]>(() => {
    const t = Math.floor(Date.now() / 1000);

    const arrByStop = new Map<string, { routeId: string; tripId: string; eta: number }[]>();
    if (rt) {
      for (const a of rt.arrivals) {
        const eta = Math.max(0, Math.round((a.arrivalUnix - t) / 60));
        if (eta > MAX_ETA_MIN) continue;
        const arr = arrByStop.get(a.stopId) ?? [];
        arr.push({ routeId: a.routeId, tripId: a.tripId, eta });
        arrByStop.set(a.stopId, arr);
      }
    }

    return nearStops.map((s, idx) => {
      const arrivals = (arrByStop.get(s.id) ?? []).sort((a, b) => a.eta - b.eta);

      let smart: ReturnType<typeof smartEtaV2> = null;
      if (rt) {
        const nextHere = rt.arrivals
          .filter((a) => a.stopId === s.id && a.arrivalUnix >= t - 30)
          .sort((a, b) => a.arrivalUnix - b.arrivalUnix)[0];
        smart = smartEtaV2({
          stopId: s.id,
          arrivals: rt.arrivals,
          vehicles: rt.vehicles,
          nowSec: t,
          agency: s.agency,
          learnedByRoute: learnedByStop?.get(s.id),
          shape: nextHere ? getShapeForTripSync(nextHere.tripId, nextHere.routeId) : null,
          riderConfirmedAgeSec: nextHere ? riderConfirmedAge.get(nextHere.tripId) : undefined,
        });
      }

      const seen = new Set<string>();
      const routes = arrivals
        .map((a) => ({ ...a, headsign: getHeadsignSync(a.tripId, a.routeId) }))
        .filter((a) => {
          const key = `${a.routeId}|${a.headsign ?? ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 3)
        .map((a) => ({
          code: getRoute(a.routeId)?.short ?? "—",
          tone: routeTone(a.routeId),
          headsign: a.headsign,
        }));
      if (routes.length === 0) routes.push({ code: "—", tone: "olive" as const, headsign: null });

      return {
        id: s.id,
        code: s.code || s.id,
        name: s.name,
        towards:
          s.agency === "IC"
            ? tt("home.intercity")
            : s.distanceKm >= 1
              ? tt("common.kmAway", { km: s.distanceKm.toFixed(s.distanceKm >= 10 ? 0 : 1) })
              : tt("common.mAway", { m: Math.round(s.distanceKm * 1000) }),
        etaMin: smart ? smart.etaMin : (arrivals[0]?.eta ?? null),
        etaConfidence: smart?.freshness,
        etaTier: smart?.tier,
        etaConfidenceLevel: smart?.confidence,
        etaBlurb: smart?.blurb,
        routes,
        highlight: idx === 0,
        kind: stopKind(s),
        amenities: getStopAmenities(s.id),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt, nearStops, learnedByStop, riderConfirmedAge, headsignsReady]);

  useEffect(() => {
    if (!rt) return;
    const t = Math.floor(Date.now() / 1000);
    for (const s of nearStops) {
      const nextHere = rt.arrivals
        .filter((a) => a.stopId === s.id && a.arrivalUnix >= t - 30)
        .sort((a, b) => a.arrivalUnix - b.arrivalUnix)[0];
      if (!nextHere) continue;
      const smart = smartEtaV2({
        stopId: s.id,
        arrivals: rt.arrivals,
        vehicles: rt.vehicles,
        nowSec: t,
        agency: s.agency,
        learnedByRoute: learnedByStop?.get(s.id),
        shape: getShapeForTripSync(nextHere.tripId, nextHere.routeId),
        riderConfirmedAgeSec: riderConfirmedAge.get(nextHere.tripId),
      });
      if (!smart) continue;
      sampleEtaPrediction({
        tripId: nextHere.tripId,
        routeId: nextHere.routeId,
        stopId: s.id,
        horizonSec: Math.round(smart.etaSec),
        p50Sec: Math.round(smart.etaSec),
        p25Sec: Math.round(smart.lowerSec),
        p90Sec: Math.round(smart.upperSec),
        tier: smart.tier,
        confidence: smart.confidence,
        operatorEtaSec: smart.operatorEtaMin * 60,
        learnedBiasSec: Math.round(smart.learnedBiasSec),
        surface: "home",
      });
    }
  }, [rt, nearStops, learnedByStop, riderConfirmedAge]);

  return cards;
}

/** Nearby place chips, deduped by the leading token of each stop name. */
export function useLandmarkChips(coords: { lat: number; lng: number }) {
  return useMemo(() => {
    const seen = new Set<string>();
    return nearestStops(coords, 14)
      .slice(0, 6)
      .filter((s) => {
        const key = s.name.split(/[·\-,]/)[0].trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  }, [coords]);
}
