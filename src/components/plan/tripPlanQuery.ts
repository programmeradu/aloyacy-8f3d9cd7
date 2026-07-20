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

export function toPlanA11y(
  prefs: AccessibilityPrefs,
  active: boolean,
): A11yPlanPrefs | undefined {
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

      return planFn({
        data: {
          from: origin,
          to: destination,
          departAtUnix: isoToUnix(timeIntent?.leaveByISO),
          arriveByUnix: isoToUnix(timeIntent?.arriveByISO),
          a11y,
        },
      });
    },
    enabled: !!origin && !!destination,
    refetchInterval: 30_000,
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
