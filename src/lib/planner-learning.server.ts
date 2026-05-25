import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Itinerary, RideLeg } from "./itinerary-types";

type DelayRow = {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_delay_sec: number;
  sample_count: number;
};

type SegmentRow = {
  route_id: string;
  from_stop_id: string;
  to_stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_runtime_sec: number;
  sample_count: number;
};

type DwellRow = {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_dwell_sec: number;
  sample_count: number;
};

type FeedTruthRow = {
  route_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_delta_sec: number;
  sample_count: number;
};

type TransferRow = {
  from_route: string;
  to_route: string;
  at_stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  planned_wait_sec: number;
  attempts: number;
  successes: number;
};

type HeadwayRow = {
  route_id: string;
  stop_id: string;
  hour_of_day: number;
  day_of_week: number;
  observed_headway_sec: number;
  sample_count: number;
  bunching_count: number;
};

export type PlannerLearningContext = {
  delayByKey: Map<string, DelayRow>;
  segmentByKey: Map<string, SegmentRow>;
  dwellByKey: Map<string, DwellRow>;
  feedTruthByKey: Map<string, FeedTruthRow>;
  transferByKey: Map<string, TransferRow>;
  headwayByKey: Map<string, HeadwayRow>;
};

const EMPTY_CONTEXT: PlannerLearningContext = {
  delayByKey: new Map(),
  segmentByKey: new Map(),
  dwellByKey: new Map(),
  feedTruthByKey: new Map(),
  transferByKey: new Map(),
  headwayByKey: new Map(),
};

function uniq(values: Array<string | number | undefined | null>) {
  return [...new Set(values.filter((v): v is string | number => v !== undefined && v !== null))];
}

function timeParts(unix: number) {
  const d = new Date(unix * 1000);
  return { hour: d.getUTCHours(), dow: d.getUTCDay() };
}

function delayKey(routeId: string, stopId: string, hour: number, dow: number) {
  return `${routeId}|${stopId}|${hour}|${dow}`;
}

function segmentKey(routeId: string, fromStopId: string, toStopId: string, hour: number, dow: number) {
  return `${routeId}|${fromStopId}|${toStopId}|${hour}|${dow}`;
}

function transferKey(fromRoute: string, toRoute: string, atStopId: string, hour: number, dow: number) {
  return `${fromRoute}|${toRoute}|${atStopId}|${hour}|${dow}`;
}

function confidenceWeight(sampleCount: number, fullAt: number) {
  if (sampleCount <= 0) return 0;
  return Math.min(1, sampleCount / fullAt);
}

export async function loadPlannerLearningContext(
  itineraries: Itinerary[],
): Promise<PlannerLearningContext> {
  if (itineraries.length === 0) return EMPTY_CONTEXT;

  const rides = itineraries.flatMap((it) => it.legs.filter((leg): leg is RideLeg => leg.kind === "ride"));
  if (rides.length === 0) return EMPTY_CONTEXT;

  const routeIds = uniq(rides.map((ride) => ride.routeId));
  const stopIds = uniq(
    rides.flatMap((ride) => [ride.board.stopId, ride.alight.stopId]),
  );
  const hours = uniq(
    rides.flatMap((ride) => [
      timeParts(ride.board.departureUnix).hour,
      timeParts(ride.alight.arrivalUnix).hour,
    ]),
  );
  const dows = uniq(
    rides.flatMap((ride) => [
      timeParts(ride.board.departureUnix).dow,
      timeParts(ride.alight.arrivalUnix).dow,
    ]),
  );

  if (routeIds.length === 0 || stopIds.length === 0 || hours.length === 0 || dows.length === 0) {
    return EMPTY_CONTEXT;
  }

  const [delayRes, segmentRes, dwellRes, feedRes, transferRes, headwayRes] = await Promise.all([
    supabaseAdmin
      .from("delay_stats")
      .select("route_id, stop_id, hour_of_day, day_of_week, mean_delay_sec, sample_count")
      .in("route_id", routeIds)
      .in("stop_id", stopIds)
      .in("hour_of_day", hours)
      .in("day_of_week", dows)
      .gte("sample_count", 2),
    supabaseAdmin
      .from("segment_runtimes")
      .select("route_id, from_stop_id, to_stop_id, hour_of_day, day_of_week, mean_runtime_sec, sample_count")
      .in("route_id", routeIds)
      .in("from_stop_id", stopIds)
      .in("to_stop_id", stopIds)
      .in("hour_of_day", hours)
      .in("day_of_week", dows)
      .gte("sample_count", 2),
    supabaseAdmin
      .from("dwell_stats")
      .select("route_id, stop_id, hour_of_day, day_of_week, mean_dwell_sec, sample_count")
      .in("route_id", routeIds)
      .in("stop_id", stopIds)
      .in("hour_of_day", hours)
      .in("day_of_week", dows)
      .gte("sample_count", 2),
    supabaseAdmin
      .from("feed_truth_delta")
      .select("route_id, hour_of_day, day_of_week, mean_delta_sec, sample_count")
      .in("route_id", routeIds)
      .in("hour_of_day", hours)
      .in("day_of_week", dows)
      .gte("sample_count", 2),
    supabaseAdmin
      .from("transfer_outcomes")
      .select("from_route, to_route, at_stop_id, hour_of_day, day_of_week, planned_wait_sec, attempts, successes")
      .in("from_route", routeIds)
      .in("to_route", routeIds)
      .in("at_stop_id", stopIds)
      .in("hour_of_day", hours)
      .in("day_of_week", dows)
      .gte("attempts", 2),
    supabaseAdmin
      .from("headway_observations")
      .select("route_id, stop_id, hour_of_day, day_of_week, observed_headway_sec, sample_count, bunching_count")
      .in("route_id", routeIds)
      .in("stop_id", stopIds)
      .in("hour_of_day", hours)
      .in("day_of_week", dows)
      .gte("sample_count", 2),
  ]);

  return {
    delayByKey: new Map(
      (delayRes.data ?? []).map((row) => [
        delayKey(row.route_id, row.stop_id, row.hour_of_day, row.day_of_week),
        row as DelayRow,
      ]),
    ),
    segmentByKey: new Map(
      (segmentRes.data ?? []).map((row) => [
        segmentKey(row.route_id, row.from_stop_id, row.to_stop_id, row.hour_of_day, row.day_of_week),
        row as SegmentRow,
      ]),
    ),
    dwellByKey: new Map(
      (dwellRes.data ?? []).map((row) => [
        delayKey(row.route_id, row.stop_id, row.hour_of_day, row.day_of_week),
        row as DwellRow,
      ]),
    ),
    feedTruthByKey: new Map(
      (feedRes.data ?? []).map((row) => [
        `${row.route_id}|${row.hour_of_day}|${row.day_of_week}`,
        row as FeedTruthRow,
      ]),
    ),
    transferByKey: new Map(
      (transferRes.data ?? []).map((row) => [
        transferKey(row.from_route, row.to_route, row.at_stop_id, row.hour_of_day, row.day_of_week),
        row as TransferRow,
      ]),
    ),
    headwayByKey: new Map(
      (headwayRes.data ?? []).map((row) => [
        delayKey(row.route_id, row.stop_id, row.hour_of_day, row.day_of_week),
        row as HeadwayRow,
      ]),
    ),
  };
}

function baseScore(itinerary: Itinerary) {
  const rides = itinerary.legs.filter((leg): leg is RideLeg => leg.kind === "ride");
  const reliabilitySec = rides.reduce((acc, ride) => acc + Math.max(0, ride.delaySec), 0);
  const walkPenaltySec = Math.max(0, itinerary.totalWalkMeters - 500) * 0.4;
  return itinerary.totalDurationSec + itinerary.transfers * 120 + reliabilitySec * 0.5 + walkPenaltySec;
}

export function scoreItineraryWithLearning(
  itinerary: Itinerary,
  context?: PlannerLearningContext | null,
) {
  const score = baseScore(itinerary);
  if (!context) return score;

  let learnedPenalty = 0;
  const rides = itinerary.legs.filter((leg): leg is RideLeg => leg.kind === "ride");

  for (const ride of rides) {
    const boardTime = timeParts(ride.board.departureUnix);
    const alightTime = timeParts(ride.alight.arrivalUnix);
    const rideDurationSec = Math.max(60, ride.alight.arrivalUnix - ride.board.departureUnix);

    const learnedDelay = context.delayByKey.get(
      delayKey(ride.routeId, ride.board.stopId, boardTime.hour, boardTime.dow),
    );
    if ((!ride.live || ride.delaySec <= 30) && learnedDelay && learnedDelay.sample_count >= 3) {
      learnedPenalty +=
        Math.max(0, learnedDelay.mean_delay_sec) * confidenceWeight(learnedDelay.sample_count, 12) * 0.35;
    }

    const learnedRuntime = context.segmentByKey.get(
      segmentKey(ride.routeId, ride.board.stopId, ride.alight.stopId, boardTime.hour, boardTime.dow),
    );
    if (learnedRuntime && learnedRuntime.sample_count >= 3) {
      learnedPenalty +=
        Math.max(0, learnedRuntime.mean_runtime_sec - rideDurationSec) *
        confidenceWeight(learnedRuntime.sample_count, 10) *
        0.6;
    }

    const learnedDwell = context.dwellByKey.get(
      delayKey(ride.routeId, ride.alight.stopId, alightTime.hour, alightTime.dow),
    );
    if (learnedDwell && learnedDwell.sample_count >= 3) {
      learnedPenalty +=
        learnedDwell.mean_dwell_sec * confidenceWeight(learnedDwell.sample_count, 10) * 0.25;
    }

    const feedTruth = context.feedTruthByKey.get(`${ride.routeId}|${boardTime.hour}|${boardTime.dow}`);
    if (feedTruth && feedTruth.sample_count >= 3) {
      learnedPenalty +=
        Math.max(0, Math.abs(feedTruth.mean_delta_sec) - 20) *
        confidenceWeight(feedTruth.sample_count, 12) *
        0.25;
    }

    const headway = context.headwayByKey.get(
      delayKey(ride.routeId, ride.board.stopId, boardTime.hour, boardTime.dow),
    );
    if (headway && headway.sample_count >= 3) {
      const bunchRate = headway.bunching_count / Math.max(1, headway.sample_count);
      learnedPenalty += bunchRate * 90;
    }
  }

  for (let i = 0; i < rides.length - 1; i++) {
    const fromRide = rides[i];
    const toRide = rides[i + 1];
    const boardTime = timeParts(toRide.board.departureUnix);
    const transfer = context.transferByKey.get(
      transferKey(fromRide.routeId, toRide.routeId, toRide.board.stopId, boardTime.hour, boardTime.dow),
    );
    if (!transfer || transfer.attempts < 3) continue;

    const successRate = transfer.successes / Math.max(1, transfer.attempts);
    const missRate = 1 - successRate;
    const plannedWaitSec = Math.max(0, toRide.board.departureUnix - fromRide.alight.arrivalUnix);
    const shortfall = Math.max(0, transfer.planned_wait_sec - plannedWaitSec);

    learnedPenalty += missRate * 240 * confidenceWeight(transfer.attempts, 10);
    learnedPenalty += Math.min(180, shortfall) * confidenceWeight(transfer.attempts, 10);
  }

  return score + learnedPenalty;
}

export function rescoreItineraryWithLearning(
  itinerary: Itinerary,
  context?: PlannerLearningContext | null,
) {
  itinerary.score = scoreItineraryWithLearning(itinerary, context);
}