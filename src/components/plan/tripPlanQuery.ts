// The main bus plan query for the trip screen, plus the small pure helpers
// that shape its inputs. Kept apart from the route so the route only renders.

import { useEffect } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { msUntilReplan } from "@aloya/core/plan-signals";
import { planMultiLeg } from "@/lib/multileg.functions";
import type { Itinerary } from "@/lib/itinerary-types";
import type { Point, TimeIntent } from "@/lib/plan-types";
import { recordTimeUsage } from "@/lib/time-history";
import type { AccessibilityPrefs } from "@/lib/accessibility-prefs";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export type A11yPlanPrefs = {
  stepFree: boolean;
  preferShade: boolean;
  lowFloor: boolean;
  maxWalkMeters: number | null;
};

/** ISO → unix seconds, undefined when the rider has no such intent. */
export function isoToUnix(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/** Stable cache-key segment so a preference change re-plans, nothing else does. */
export function a11yCacheKey(prefs: AccessibilityPrefs, active: boolean): string {
  if (!active) return "off";
  return `${prefs.stepFree ? "s" : ""}${prefs.preferShade ? "h" : ""}${prefs.lowFloor ? "l" : ""}-${
    prefs.maxWalkMeters ?? "x"
  }`;
}

export function toPlanA11y(prefs: AccessibilityPrefs, active: boolean): A11yPlanPrefs | undefined {
  if (!active) return undefined;
  return {
    stepFree: prefs.stepFree,
    preferShade: prefs.preferShade,
    lowFloor: prefs.lowFloor,
    maxWalkMeters: prefs.maxWalkMeters,
  };
}

export function useTripPlanQuery({
  origin,
  destination,
  timeIntent,
  a11y,
  a11yKey,
  rtTick,
}: {
  origin: Point | null;
  destination: Point | null;
  timeIntent: TimeIntent | null;
  a11y: A11yPlanPrefs | undefined;
  a11yKey: string;
  rtTick: number;
}) {
  const planFn = useServerFn(planMultiLeg);
  const isOnline = useOnlineStatus();

  // Auto-refreshes every 30s, on reconnect, and whenever the realtime feed
  // advances — that is what makes "the bus left, give me the next one" free.
  const query = useQuery({
    queryKey: [
      "plan",
      origin?.lat,
      origin?.lng,
      destination?.lat,
      destination?.lng,
      timeIntent?.leaveByISO ?? null,
      timeIntent?.arriveByISO ?? null,
      rtTick,
      a11yKey,
    ],
    queryFn: async () => {
      if (!origin || !destination)
        return {
          itineraries: [] as Itinerary[],
          noScheduleAvailable: undefined,
          requestedDate: undefined,
        };
      // Learn the rider's rhythm from times they actually plan around, so the
      // picker's shortcuts get personal instead of staying hardcoded.
      if (timeIntent?.arriveByISO)
        recordTimeUsage({ atMs: new Date(timeIntent.arriveByISO).getTime(), mode: "arrive" });
      else if (timeIntent?.leaveByISO)
        recordTimeUsage({ atMs: new Date(timeIntent.leaveByISO).getTime(), mode: "leave" });

      const departAtUnix = isoToUnix(timeIntent?.leaveByISO);
      const arriveByUnix = isoToUnix(timeIntent?.arriveByISO);
      const local = await planTimetableLocally(origin, destination, departAtUnix, arriveByUnix, a11y);
      return planFn({
        data: {
          from: origin,
          to: destination,
          departAtUnix,
          arriveByUnix,
          a11y,
          ...(local ? { clientScheduled: local.itineraries, clientServiceDate: local.serviceDate } : {}),
        },
      });
    },
    enabled: !!origin && !!destination && isOnline,
    // A cold engine or a dropped upstream call is transient; back off briefly
    // and try again instead of letting one hiccup read as "no route".
    retry: isOnline ? 2 : 0,
    retryDelay: (attempt) => Math.min(1_500 * 2 ** attempt, 6_000),
    refetchInterval: isOnline ? 30_000 : false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,

    // Keep the rendered itineraries on screen through a background refresh so
    // the list never blanks mid-read and per-card state stays mounted.
    placeholderData: keepPreviousData,
    notifyOnChangeProps: ["data", "error"],
  });

  const results = query.data?.itineraries ?? null;
  const top = results?.[0] ?? null;

  // Re-plan the moment the recommended bus pulls away — the 30s interval
  // would otherwise leave a departed bus on screen.
  const refetch = query.refetch;
  useEffect(() => {
    const delay = msUntilReplan(top, Date.now());
    if (delay == null) return;
    if (delay === 0) {
      void refetch();
      return;
    }
    const timer = window.setTimeout(() => void refetch(), delay);
    return () => window.clearTimeout(timer);
  }, [top, refetch]);

  return { query, results, top };
}

// ---- Timetable planning in the browser ------------------------------------
// The Worker cannot afford the timetable search on Workers Free (10 ms CPU),
// so the browser runs it from the static shards and the server merges the
// result with the live planner. Results are reused for a minute so the 30 s
// refresh and realtime ticks do not re-run the search each time.
const LOCAL_TTL_MS = 60_000;
const ARRIVE_BY_BACKSEARCH_SEC = 6 * 3600;
const localCache = new Map<
  string,
  { at: number; value: { itineraries: Itinerary[]; serviceDate: string } | null }
>();

async function planTimetableLocally(
  origin: Point,
  destination: Point,
  departAtUnix: number | undefined,
  arriveByUnix: number | undefined,
  a11y: A11yPlanPrefs | undefined,
): Promise<{ itineraries: Itinerary[]; serviceDate: string } | null> {
  if (typeof window === "undefined") return null;
  const key = [
    origin.lat.toFixed(5),
    origin.lng.toFixed(5),
    destination.lat.toFixed(5),
    destination.lng.toFixed(5),
    departAtUnix ?? "",
    arriveByUnix ?? "",
    a11y?.stepFree ? 1 : 0,
    a11y?.lowFloor ? 1 : 0,
  ].join("|");
  const hit = localCache.get(key);
  const nowSec = Math.floor(Date.now() / 1000);
  if (hit && Date.now() - hit.at < LOCAL_TTL_MS) {
    const first = hit.value?.itineraries[0];
    if (!first || first.departureUnix > nowSec) return hit.value;
  }
  let departureUnix = departAtUnix;
  if (!departureUnix && arriveByUnix) {
    departureUnix = Math.max(nowSec, arriveByUnix - ARRIVE_BY_BACKSEARCH_SEC);
  }
  const run = async () => {
    const mod = await import("@/lib/schedule-client");
    const r = await mod.planScheduledOnClient(origin, destination, {
      departureUnix,
      explicitTime: !!(departAtUnix || arriveByUnix),
      date: arriveByUnix ? mod.ymdForUnix(arriveByUnix) : undefined,
      stepFree: a11y?.stepFree,
      lowFloor: a11y?.lowFloor,
    });
    return { itineraries: r.itineraries, serviceDate: r.serviceDate };
  };
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error("timeout")), 25_000)),
    ]);
    localCache.set(key, { at: Date.now(), value });
    return value;
  } catch (err) {
    // No shard for that date, or the download failed: the server says which.
    if (typeof console !== "undefined") console.warn("[plan] timetable in browser failed", err);
    return null;
  }
}
