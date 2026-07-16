// Server-side machinery behind an arrival promise: re-plan the trip, read
// every condition signal we hold, and turn them into one leave time the rider
// can trust. All the rules live in @aloya/core/arrival-promise — this file
// only fetches.

import {
  buildDepartureLadder,
  composeLeaveBuffer,
  isUnmakeable,
  recommendedRung,
  rushHourFactor,
  type ItineraryLike,
  type LadderRung,
  type MarginPref,
  type RushProfile,
} from "@aloya/core/arrival-promise";
import { planMultiLeg } from "@/lib/multileg.functions";
import { computeLeaveAdjustment, fetchCurrentWeather } from "@/lib/leave-time-adjuster";
import type { DelaySample, WeatherCoupling } from "@/lib/leave-time-adjuster";
import { distanceM } from "@/lib/geo";
import type { Itinerary } from "@/lib/itinerary-types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PromisePoint = { lat: number; lng: number; label: string };

export type PromisePlan = {
  ladder: LadderRung[];
  best: LadderRung | null;
  itinerary: Itinerary | null;
  leaveByUnix: number | null;
  bufferSec: number;
  reasonShort: string | null;
  unmakeable: boolean;
  earliestArrivalUnix: number | null;
};

const NICOSIA_TZ = "Asia/Nicosia";

/** Local hour + weekday in Cyprus, independent of where the worker runs. */
export function cyprusHourAndDay(unix: number): { hourOfDay: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: NICOSIA_TZ,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date(unix * 1000));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { hourOfDay: hour, dayOfWeek: Math.max(0, order.indexOf(wd)) };
}

/** Sample points along an itinerary, used to match nearby road incidents. */
function itineraryPoints(it: Itinerary): Array<{ lat: number; lng: number }> {
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const leg of it.legs) {
    if (leg.kind === "ride") {
      pts.push({ lat: leg.board.lat, lng: leg.board.lng });
      pts.push({ lat: leg.alight.lat, lng: leg.alight.lng });
    } else if (leg.kind === "walk") {
      pts.push({ lat: leg.from.lat, lng: leg.from.lng });
      pts.push({ lat: leg.to.lat, lng: leg.to.lng });
    } else {
      pts.push({ lat: leg.lat, lng: leg.lng });
    }
  }
  return pts.slice(0, 64);
}

type IncidentLite = {
  id: string;
  lat?: number | null;
  lng?: number | null;
  severity: "low" | "medium" | "high";
  title?: string;
  description?: string;
};

const DISRUPTION_SEC: Record<IncidentLite["severity"], number> = {
  low: 60,
  medium: 180,
  high: 360,
};

/** Nearest active road incident to the planned path, if any. */
async function disruptionSignal(points: Array<{ lat: number; lng: number }>): Promise<{
  sec: number;
  label: string | null;
}> {
  try {
    const { data: rows } = await supabaseAdmin
      .from("pulse_signals")
      .select("payload, fetched_at")
      .eq("key", "traffic")
      .gte("fetched_at", new Date(Date.now() - 60 * 60_000).toISOString())
      .order("fetched_at", { ascending: false })
      .limit(8);

    let worst: IncidentLite | null = null;
    for (const row of rows ?? []) {
      const payload = row.payload as unknown as { incidents?: IncidentLite[] } | null;
      for (const inc of payload?.incidents ?? []) {
        if (inc.lat == null || inc.lng == null) continue;
        const near = points.some((p) => distanceM({ lat: inc.lat!, lng: inc.lng! }, p) <= 500);
        if (!near) continue;
        if (!worst || DISRUPTION_SEC[inc.severity] > DISRUPTION_SEC[worst.severity]) worst = inc;
      }
    }
    if (!worst) return { sec: 0, label: null };
    return {
      sec: DISRUPTION_SEC[worst.severity],
      label: (worst.title || worst.description || "road disruption").slice(0, 48),
    };
  } catch (e) {
    console.warn("[arrival-promise] disruption lookup failed", e);
    return { sec: 0, label: null };
  }
}

function weatherPhrase(condition: string): string {
  switch (condition) {
    case "rain-light":
      return "light rain";
    case "rain-heavy":
      return "heavy rain";
    case "thunder":
      return "storm";
    case "snow":
      return "snow";
    case "fog":
      return "fog";
    default:
      return "weather";
  }
}

/**
 * The whole watch step for one promise: plan, measure, decide when to leave.
 * Never throws — a failed signal simply contributes nothing.
 */
export async function computePromisePlan(args: {
  origin: PromisePoint;
  destination: PromisePoint;
  targetArrivalUnix: number;
  margin: MarginPref;
}): Promise<PromisePlan> {
  const { origin, destination, targetArrivalUnix, margin } = args;

  const result = await planMultiLeg({
    data: {
      from: { lat: origin.lat, lng: origin.lng, label: origin.label },
      to: { lat: destination.lat, lng: destination.lng, label: destination.label },
      arriveByUnix: targetArrivalUnix,
      mode: "both",
    } as never,
  });

  const itineraries = (result?.itineraries ?? []) as Itinerary[];
  const ladder = buildDepartureLadder(itineraries as unknown as ItineraryLike[], targetArrivalUnix, margin);
  const best = recommendedRung(ladder);
  const chosen = best ? (itineraries.find((i) => i.id === best.itineraryId) ?? null) : null;

  if (!best || !chosen) {
    return {
      ladder,
      best: null,
      itinerary: null,
      leaveByUnix: null,
      bufferSec: 0,
      reasonShort: null,
      unmakeable: true,
      earliestArrivalUnix: itineraries.length
        ? Math.min(...itineraries.map((i) => i.arrivalUnix))
        : null,
    };
  }

  const routeIds = chosen.legs
    .filter((l): l is Extract<typeof l, { kind: "ride" }> => l.kind === "ride")
    .map((l) => l.routeId);

  const weather = await fetchCurrentWeather(origin.lat, origin.lng);
  const { hourOfDay, dayOfWeek } = cyprusHourAndDay(best.leaveByUnix);

  const [delaysRes, couplingRes, rushRes, disruption] = await Promise.all([
    routeIds.length
      ? supabaseAdmin
          .from("delay_stats")
          .select("route_id, mean_delay_sec, sample_count")
          .in("route_id", routeIds)
          .gte("sample_count", 3)
          .limit(64)
      : Promise.resolve({ data: [] as DelaySample[] }),
    routeIds.length && weather !== "clear" && weather !== "cloudy" && weather !== "unknown"
      ? supabaseAdmin
          .from("weather_delay_coupling")
          .select("route_id, condition, mean_extra_delay_sec, sample_count")
          .in("route_id", routeIds)
          .eq("condition", weather)
          .gte("sample_count", 3)
          .limit(64)
      : Promise.resolve({ data: [] as WeatherCoupling[] }),
    routeIds.length
      ? supabaseAdmin
          .from("delay_stats")
          .select("mean_delay_sec, sample_count, hour_of_day, day_of_week")
          .in("route_id", routeIds)
          .eq("hour_of_day", hourOfDay)
          .eq("day_of_week", dayOfWeek)
          .limit(64)
      : Promise.resolve({ data: [] }),
    disruptionSignal(itineraryPoints(chosen)),
  ]);

  const adj = computeLeaveAdjustment({
    routeIds,
    weather,
    delays: (delaysRes.data ?? []) as DelaySample[],
    weatherCoupling: (couplingRes.data ?? []) as WeatherCoupling[],
  });

  const rushRows = (rushRes.data ?? []) as Array<{
    mean_delay_sec: number;
    sample_count: number;
    hour_of_day: number;
    day_of_week: number;
  }>;
  const totalSamples = rushRows.reduce((s, r) => s + r.sample_count, 0);
  const profile: RushProfile[] = totalSamples
    ? [
        {
          hourOfDay,
          dayOfWeek,
          meanDelaySec:
            rushRows.reduce((s, r) => s + r.mean_delay_sec * r.sample_count, 0) / totalSamples,
          sampleCount: totalSamples,
        },
      ]
    : [];

  const rushSec = rushHourFactor({ hourOfDay, dayOfWeek, profile });

  const buffer = composeLeaveBuffer({
    weatherSec: adj.weatherSec,
    weatherLabel: weatherPhrase(weather),
    trafficSec: adj.trafficSec,
    rushSec,
    disruptionSec: disruption.sec,
    disruptionLabel: disruption.label,
  });

  return {
    ladder,
    best,
    itinerary: chosen,
    leaveByUnix: best.leaveByUnix - buffer.extraSec,
    bufferSec: buffer.extraSec,
    reasonShort: buffer.reasonShort,
    unmakeable: isUnmakeable(ladder),
    earliestArrivalUnix: itineraries.length
      ? Math.min(...itineraries.map((i) => i.arrivalUnix))
      : null,
  };
}

/** Compact snapshot of the chosen itinerary stored on the promise row. */
export function planSnapshot(it: Itinerary | null) {
  if (!it) return {};
  return {
    itineraryId: it.id,
    departureUnix: it.departureUnix,
    arrivalUnix: it.arrivalUnix,
    transfers: it.transfers,
    source: it.source,
    legs: it.legs.map((l) => {
      if (l.kind === "ride") {
        return {
          kind: "ride" as const,
          routeId: l.routeId,
          routeShort: l.routeShort,
          boardName: l.board.name,
          boardUnix: l.board.departureUnix,
          alightName: l.alight.name,
          alightUnix: l.alight.arrivalUnix,
          live: l.live,
        };
      }
      if (l.kind === "walk") {
        return {
          kind: "walk" as const,
          durationSec: l.durationSec,
          distanceMeters: l.distanceMeters,
          toName: l.to.name,
        };
      }
      return { kind: "wait" as const, durationSec: l.durationSec, name: l.name };
    }),
  };
}
