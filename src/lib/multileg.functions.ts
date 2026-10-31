// Server-fn wrapper for the multi-leg planner so it can be called from routes.
//
// Phase 2c: returns BOTH realtime and scheduled results merged + deduped +
// pruned by the no-mediocrity filter. The realtime path covers the next ~60
// min with high accuracy; the scheduled path unlocks intercity and farther
// future. Together they give honest coverage at every distance.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { planMultiLegJourney, type MultiLegDiagnostics } from "./journey-multileg.server";
import {
  planMultiLegScheduled,
  localDateForUnix,
  type ScheduledDiagnostics,
  NoScheduleAvailableError,
} from "./journey-scheduled.server";
import { getSkippedTransferCount } from "./overrides.server";
import type { Itinerary, RideLeg } from "./itinerary-types";
import { annotateRationales } from "./itinerary-rationale";
import { applyAccessibilityWeights } from "./accessibility-weights";
import { loadWheelchairAccess } from "./stop-condition.server";
import { collectItineraryStopIds, filterLowFloorItineraries } from "@aloya/core/low-floor";
import { createLogger } from "./logger";
import { filterDominated } from "@aloya/core/plan-score";
import { withTimeout } from "./server-cache";
import { overlayLiveOnScheduled, sanitizeClientItineraries } from "./schedule-overlay.server";
import { egressMeters, rankPenaltySec } from "@aloya/core/plan-score";
import { airportFor } from "./plan-airports";
import { stopsShortOfAirport } from "./raptor-direct";

const log = createLogger("multileg");

const PointSchema = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  label: z.string().max(200).optional(),
});

const A11ySchema = z
  .object({
    stepFree: z.boolean().optional(),
    preferShade: z.boolean().optional(),
    lowFloor: z.boolean().optional(),
    maxWalkMeters: z.number().int().min(100).max(3000).nullable().optional(),
  })
  .optional();

const InputSchema = z.object({
  from: PointSchema,
  to: PointSchema,
  debug: z.boolean().optional(),
  mode: z.enum(["live", "scheduled", "both"]).optional(),
  /** Unix seconds. Plan trips departing at/after this time. */
  departAtUnix: z.number().int().positive().optional(),
  /** Unix seconds. Plan trips arriving at/before this time. */
  arriveByUnix: z.number().int().positive().optional(),
  /** Wave 2.2 — accessibility. Ranking nudge plus D1 step-free filter. */
  a11y: A11ySchema,
  /** Timetable itineraries the browser planned from the static shards
   *  (schedule-client.ts). When present the Worker skips its own timetable
   *  search, which Workers Free cannot afford (10 ms CPU). */
  clientScheduled: z.array(z.unknown()).max(40).optional(),
  clientServiceDate: z.string().regex(/^\d{8}$/).optional(),
});

export type MultiLegResult = {
  itineraries: Itinerary[];
  searchedAt: number;
  elapsedMs: number;
  mode: "live" | "scheduled" | "both";
  /** True when the requested date has no timetable shard published yet. */
  noScheduleAvailable?: boolean;
  /** YYYYMMDD the planner tried to load when noScheduleAvailable is true. */
  requestedDate?: string;
  diagnostics?: {
    live?: MultiLegDiagnostics;
    scheduled?: ScheduledDiagnostics;
    mergedRaw: number;
    /** Candidates removed by the journey-cap / arrive-by / depart-at filters. */
    dropped?: { tooLong: number; arriveBy: number; departAt: number };
    afterDedup: number;

    prunedMediocre: number;
    finalCount: number;
  };
};

const TOP_K = 5;
const MAX_TOTAL_JOURNEY_SEC = 300 * 60;
const FUTURE_THRESHOLD_SEC = 20 * 60; // beyond this, skip live and use scheduled only
const ARRIVE_BY_BACKSEARCH_SEC = 6 * 3600;
const AIRPORT_RE = /\b(airport|terminal)\b/i;
const AIRPORT_EXTRA_TRANSFER_MIN_SAVINGS_SEC = 45 * 60;
/** On-street metres of final walk that still count as arriving (about 1 km straight). */
const NEAR_EGRESS_M = 1_400;

/**
 * Time actually spent travelling, excluding the wait before the first bus.
 * An overnight or Sunday query legitimately waits hours for the first
 * departure; that wait must not count against the max-journey cap, or the
 * only real answer ("first bus at 05:40") gets pruned and the rider is told
 * no route exists.
 */
function travelSec(it: Itinerary): number {
  const firstRideIdx = it.legs.findIndex((l) => l.kind === "ride");
  if (firstRideIdx < 0) return it.totalDurationSec;
  const firstRide = it.legs[firstRideIdx] as RideLeg;
  let accessSec = 0;
  for (let i = 0; i < firstRideIdx; i++) {
    const l = it.legs[i];
    if (l.kind === "walk") accessSec += l.durationSec;
  }
  const start = firstRide.board.departureUnix - accessSec;
  return Math.max(0, it.arrivalUnix - start);
}

function isAirportQuery(point: { label?: string }): boolean {
  return AIRPORT_RE.test(point.label ?? "");
}

function pruneAirportTransferNoise(itineraries: Itinerary[]): Itinerary[] {
  if (itineraries.length <= 1) return itineraries;

  let kept = [...itineraries];
  const maxTransfers = Math.max(...kept.map((it) => it.transfers));

  for (let transfers = 1; transfers <= maxTransfers; transfers++) {
    const bestSimpler = kept
      .filter((it) => it.transfers < transfers)
      .reduce<Itinerary | null>(
        (best, it) => (!best || it.totalDurationSec < best.totalDurationSec ? it : best),
        null,
      );

    if (!bestSimpler) continue;

    kept = kept.filter((it) => {
      if (it.transfers < transfers) return true;
      const timeSavedVsSimpler = bestSimpler.totalDurationSec - it.totalDurationSec;
      return timeSavedVsSimpler >= AIRPORT_EXTRA_TRANSFER_MIN_SAVINGS_SEC;
    });
  }

  return kept;
}

/**
 * An option that rides exactly what another option rides and then adds more
 * buses is only worth showing when the extra buses get the rider there at
 * least 5 min sooner. Otherwise it is the same trip with a change bolted on
 * (a 0 min hop to skip a short walk).
 */
function dropAddedTail(its: Itinerary[]): Itinerary[] {
  const sig = (it: Itinerary) =>
    it.legs.filter((l): l is RideLeg => l.kind === "ride").map((r) => `${r.routeId}|${r.board.stopId}`);
  const sigs = its.map(sig);
  return its.filter((x, i) => {
    const sx = sigs[i];
    return !its.some((y, j) => {
      if (j === i) return false;
      const sy = sigs[j];
      if (sy.length === 0 || sy.length >= sx.length) return false;
      for (let k = 0; k < sy.length; k++) if (sy[k] !== sx[k]) return false;
      return x.arrivalUnix > y.arrivalUnix - 5 * 60;
    });
  });
}

const isCoachIt = (it: Itinerary) => it.legs.some((l) => l.kind === "ride" && l.routeId.startsWith("kapnos:"));
/** Route id without the feed namespace: the live planner says "4050041", the timetable "9:4050041". */
const normRoute = (id: string) => id.replace(/^\d+:/, "");
const normStop = (id: string) => id.replace(/^\d+:/, "");
function rideKey(it: Itinerary): string {
  return it.legs
    .filter((l): l is RideLeg => l.kind === "ride")
    .map((r) => `${normRoute(r.routeId)}|${normStop(r.board.stopId)}|${normStop(r.alight.stopId)}`)
    .join("→");
}
function firstBoard(it: Itinerary): number {
  const r = it.legs.find((l): l is RideLeg => l.kind === "ride");
  return r ? r.board.departureUnix : it.departureUnix;
}
const routeSeq = (it: Itinerary) =>
  it.legs.filter((l): l is RideLeg => l.kind === "ride").map((r) => normRoute(r.routeId)).join(">");

/**
 * Two options that ride the same lines and catch the same first bus (within
 * 5 min) are one option to the rider, even when they change at different
 * stops or one came from the live planner. Keep the better ranked one.
 */
function dropNearDuplicates(sorted: Itinerary[]): Itinerary[] {
  const out: Itinerary[] = [];
  for (const it of sorted) {
    const seq = routeSeq(it);
    const fb = firstBoard(it);
    if (out.some((o) => routeSeq(o) === seq && Math.abs(firstBoard(o) - fb) <= 5 * 60)) continue;
    out.push(it);
  }
  return out;
}

const LATER_WINDOW_SEC = 3 * 3600;
const WANT_OPTIONS = 3;

async function laterDepartures(
  data: z.infer<typeof InputSchema>,
  kept: Itinerary[],
  nowSec: number,
  destAirport: ReturnType<typeof airportFor>,
): Promise<Itinerary[]> {
  const buses = kept.filter((it) => !isCoachIt(it));
  if (buses.length === 0 || buses.length >= WANT_OPTIONS) return [];
  const best = buses[0];
  const bestTravel = travelSec(best);
  const minTransfers = Math.min(...buses.map((b) => b.transfers));
  const firstLeave = Math.min(...buses.map((b) => b.departureUnix));
  const added: Itinerary[] = [];
  const all = () => [...kept, ...added];
  for (let pass = 0; pass < 2 && buses.length + added.length < WANT_OPTIONS; pass++) {
    const start = Math.max(nowSec, ...all().filter((x) => !isCoachIt(x)).map(firstBoard)) + 60;
    if (start > firstLeave + LATER_WINDOW_SEC) break;
    const res = await planMultiLegScheduled(data.from, data.to, {
      departureUnix: start,
      accessibilityPrefs: {
        requireSafeCrossing: data.a11y?.stepFree ?? false,
        requireWheelchair: data.a11y?.lowFloor ?? false,
      },
    });
    if (res.diagnostics.rolledToNextDay) break;
    const cands = res.itineraries
      .filter((it) => !isCoachIt(it))
      .filter((it) => it.departureUnix <= firstLeave + LATER_WINDOW_SEC)
      .filter((it) => firstBoard(it) >= start - 60)
      .filter((it) => it.transfers <= minTransfers + 1)
      .filter((it) => travelSec(it) <= bestTravel * 1.5 + 20 * 60)
      .filter((it) =>
        destAirport ? !stopsShortOfAirport(it, destAirport) : egressMeters(it.legs) <= NEAR_EGRESS_M,
      )
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix || a.transfers - b.transfers);
    let took = false;
    for (const it of cands) {
      if (buses.length + added.length >= WANT_OPTIONS) break;
      const seq = routeSeq(it);
      const fb = firstBoard(it);
      if (all().some((o) => rideKey(o) === rideKey(it) && Math.abs(firstBoard(o) - fb) <= 5 * 60)) continue;
      if (all().some((o) => routeSeq(o) === seq && Math.abs(firstBoard(o) - fb) <= 10 * 60)) continue;
      added.push(it);
      took = true;
      break; // one per pass: the next pass searches after this departure
    }
    if (!took) break;
  }
  return added;
}

export const planMultiLeg = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<MultiLegResult> => {
    const t0 = Date.now();
    const nowSec = Math.floor(Date.now() / 1000);

    // Resolve target departure. arriveBy searches backwards across a wider
    // window so first-mile feeds with sparse late-night service still catch
    // a coach without falling back to "no city bus".
    let departureUnix = data.departAtUnix ?? null;
    if (!departureUnix && data.arriveByUnix) {
      departureUnix = Math.max(nowSec, data.arriveByUnix - ARRIVE_BY_BACKSEARCH_SEC);
    }
    const isFuture = departureUnix !== null && departureUnix - nowSec > FUTURE_THRESHOLD_SEC;

    // Live realtime is only meaningful for "leave now"; future trips go scheduled-only.
    const mode = data.mode ?? (isFuture ? "scheduled" : "both");

    type LiveR = { itineraries: Itinerary[]; diagnostics?: MultiLegDiagnostics } | null;
    type SchedR = { itineraries: Itinerary[]; diagnostics: ScheduledDiagnostics } | null;

    // A planner that *crashed* is not the same claim as a corridor with no
    // service. We track the difference so an infrastructure hiccup never
    // renders as the honest-sounding lie "no bus serves this journey".
    let liveFailed = false;
    let schedFailed = false;

    const livePromise: Promise<LiveR> =
      mode === "live" || mode === "both"
        ? planMultiLegJourney(data.from, data.to, {
            collectDiagnostics: data.debug ?? false,
          }).catch((e: unknown) => {
            liveFailed = true;
            log.warn("live planner failed", { err: (e as Error).message });
            return null;
          })
        : Promise.resolve(null);
    let noScheduleAvailable = false;
    let requestedDate: string | undefined;
    const serverScheduled = (): Promise<SchedR> =>
      planMultiLegScheduled(data.from, data.to, {
        departureUnix: departureUnix ?? undefined,
        explicitTime: !!(data.departAtUnix || data.arriveByUnix),
        date: data.arriveByUnix ? localDateForUnix(data.arriveByUnix) : undefined,
        accessibilityPrefs: {
          requireSafeCrossing: data.a11y?.stepFree ?? false,
          requireWheelchair: data.a11y?.lowFloor ?? false,
        },
      }).catch((e: unknown) => {
        if (e instanceof NoScheduleAvailableError) {
          noScheduleAvailable = true;
          requestedDate = e.date;
          log.warn("no schedule shard", { date: e.date });
          return null;
        }
        schedFailed = true;
        log.warn("scheduled planner failed", { err: (e as Error).message });
        return null;
      });
    const schedPromise: Promise<SchedR> =
      (mode === "scheduled" || mode === "both") && data.clientScheduled
        ? (async (): Promise<SchedR> => {
            let its = sanitizeClientItineraries(data.clientScheduled);
            // The browser plans with estimated walks. Verify them here (the
            // Worker has the walking routes): an option whose verified walk
            // misses its bus is dropped, and when that leaves nothing, the
            // Worker plans the trip itself with verified walks.
            let verified: "yes" | "timeout" | "server" = "yes";
            if (its.length > 0) {
              const { refineAllItineraries } = await import("./walk-refine.server");
              const { rebaseToLeave } = await import("./raptor-plan");
              const base = departureUnix ?? nowSec;
              const fromBase = its.map((it) => ({ ...it, departureUnix: Math.min(it.departureUnix, base) }));
              const checked = await withTimeout(refineAllItineraries(fromBase), 4_000, null);
              if (checked === null) verified = "timeout";
              else if (checked.length > 0) its = checked.map(rebaseToLeave);
              else {
                const server = await serverScheduled();
                if (server && server.itineraries.length > 0) {
                  return {
                    ...server,
                    diagnostics: { ...server.diagnostics, reasons: [...(server.diagnostics.reasons ?? []), "browser options missed their buses on verified walks; planned on the Worker"] },
                  };
                }
                verified = "server";
              }
            }
            const ov = await withTimeout(overlayLiveOnScheduled(its), 2_500, {
              liveArrivalCount: 0,
              legsOverlaid: 0,
            });
            return {
              itineraries: its,
              diagnostics: {
                ...ov,
                serviceDate: data.clientServiceDate,
                reasons: [`planned in the browser from the static timetable shard (walks verified: ${verified})`],
              } as unknown as ScheduledDiagnostics,
            };
          })()
        : mode === "scheduled" || mode === "both"
        ? serverScheduled()
        : Promise.resolve(null);

    const [liveResult, schedResult] = await Promise.all([livePromise, schedPromise]);

    // Every engine we asked blew up: surface it so the client retries and the
    // rider sees "we couldn't reach the planner", not "no route exists".
    const liveAsked = mode === "live" || mode === "both";
    const schedAsked = mode === "scheduled" || mode === "both";
    const liveOk = liveAsked ? !liveFailed : true;
    const schedOk = schedAsked ? !schedFailed : true;
    if (!liveOk && !schedOk) {
      throw new Error("planner_unavailable");
    }

    const merged: Itinerary[] = [
      ...(liveResult?.itineraries ?? []),
      ...(schedResult?.itineraries ?? []),
    ];

    // One engine down and the survivor found nothing: we genuinely do not
    // know whether a route exists, so ask the client to try again rather
    // than assert an empty corridor.
    if (merged.length === 0 && (liveFailed || schedFailed) && !noScheduleAvailable) {
      throw new Error("planner_unavailable");
    }

    const learningMod = await import("./planner-learning.server");
    const learning = await withTimeout(
      learningMod.loadPlannerLearningContext(merged).catch(() => null),
      1_200,
      null,
    );
    for (const it of merged) learningMod.rescoreItineraryWithLearning(it, learning);
    const mergedRaw = merged.length;

    // Dedupe by (signature). Prefer "live" or "mixed" over "estimated".
    const sourceRank = { live: 0, mixed: 1, estimated: 2 } as const;
    const dedup = new Map<string, Itinerary>();
    const dropped = { tooLong: 0, arriveBy: 0, departAt: 0 };
    const tooLong: Itinerary[] = [];
    for (const it of merged) {
      // The coach's own timetable sets the wait at its stop; one coach option
      // is kept and ranked below, so the bus-marathon cap does not apply.
      if (!isCoachIt(it) && travelSec(it) > MAX_TOTAL_JOURNEY_SEC) {
        dropped.tooLong++;
        tooLong.push(it);
        continue;
      }
      // Honour arrive-by: 10 min slack so a near-miss still shows with a warning upstream.
      if (data.arriveByUnix && it.arrivalUnix > data.arriveByUnix + 600) {
        dropped.arriveBy++;
        continue;
      }
      // Honour depart-at: keep options that depart within 2h of the requested time.
      if (departureUnix && it.departureUnix < departureUnix - 300) {
        dropped.departAt++;
        continue;
      }
      const key = rideKey(it);
      const existing = dedup.get(key);
      if (
        !existing ||
        sourceRank[it.source] < sourceRank[existing.source] ||
        (sourceRank[it.source] === sourceRank[existing.source] && it.score < existing.score)
      ) {
        dedup.set(key, it);
      }
    }

    // Last-resort honesty: a sparse rural corridor can legitimately need a
    // long mid-journey wait (village services run a handful of times a day).
    // Pruning those to zero tells the rider "no route exists", which is a
    // lie. When the journey cap wiped out every option, keep the shortest
    // over-cap ones rather than returning an empty result.
    if (dedup.size === 0 && tooLong.length > 0) {
      const rescued = [...tooLong].sort((a, b) => travelSec(a) - travelSec(b)).slice(0, TOP_K);
      for (const it of rescued) {
        const key = rideKey(it);
        if (!dedup.has(key)) dedup.set(key, it);
      }
    }
    const afterDedup = dedup.size;

    // The live and scheduled planners each only see their own candidate pool,
    // so dominance is applied once more over the merged set: an option is
    // dropped only when another arrives no later, with no more changes and no
    // more walking. Nothing is filtered for having a change, or for lacking
    // one — a direct ride survives because nothing beats it.
    const all = [...dedup.values()];
    // Arrive at the door, not near it. An option whose last bus stops well
    // short (or, for an airport, anywhere but the terminal) is kept only when
    // nothing reaches the door.
    const destAirport = airportFor(data.to);
    const arrives = all.filter((it) =>
      destAirport ? !stopsShortOfAirport(it, destAirport) : egressMeters(it.legs) <= NEAR_EGRESS_M,
    );
    const pool = arrives.length > 0 ? arrives : all;
    // The Kapnos coach is offered on airport trips even when a bus edges it on
    // paper: one booked seat, luggage space, no change at Larnaca station.
    // Only its best departure is kept, and it is ranked like everything else.
    const isCoach = (it: Itinerary) => it.legs.some((l) => l.kind === "ride" && l.routeId.startsWith("kapnos:"));
    const coach = pool.filter(isCoach).sort((a, b) => a.score - b.score).slice(0, 1);
    let kept = dropAddedTail([...filterDominated(pool.filter((it) => !isCoach(it))), ...coach]);
    const prunedMediocre = afterDedup - kept.length;

    // Learning loop: penalise transfer itineraries when riders have
    // repeatedly skipped the transfer for this exact OD pair. Each prior
    // skip adds 90 s of effective penalty, capped at 6 min, so a stubborn
    // transfer can still win if it's genuinely faster.
    const skips = await withTimeout(
      getSkippedTransferCount(data.from, data.to).catch(() => 0),
      800,
      0,
    );
    // Every option is ranked on the same footing: when it gets the rider
    // there. Scores carried in from the planners were measured from different
    // search bases (a retry from later, tomorrow's first bus, the browser's
    // re-based departure), so they are not comparable with each other.
    for (const it of kept) it.score = it.arrivalUnix - nowSec;
    if (skips >= 3) {
      const bias = Math.min(skips * 90, 360);
      for (const it of kept) {
        if (it.transfers > 0) it.score += bias;
      }
    }

    // Final rank: arrival plus a heavy premium per change, long walks and a
    // final walk short of the door (plan-score `rankPenaltySec`). One rule for
    // live, timetable and coach options alike; no transfers-first override.
    for (const it of kept) {
      it.score += rankPenaltySec(it, { airportShort: stopsShortOfAirport(it, destAirport) });
    }

    if (data.a11y && (data.a11y.stepFree || data.a11y.lowFloor)) {
      const access = await withTimeout(
        loadWheelchairAccess(collectItineraryStopIds(kept)).catch(
          () => ({}) as Record<string, string>,
        ),
        1_200,
        {} as Record<string, string>,
      );
      const filtered = filterLowFloorItineraries(kept, access);
      if (filtered.length > 0) kept = filtered;
    }

    kept.sort((a, b) => a.score - b.score);
    kept = dropNearDuplicates(kept);

    // Aim for three distinct options. When the network only produced one or
    // two (a village with a bus an hour), add the next departures of the
    // same trip from the timetable, but never junk: no extra change, not much
    // longer, leaving within three hours of the first option.
    let laterAdded = 0;
    if (mode !== "live" && !data.arriveByUnix) {
      try {
        const extra = await withTimeout(
          laterDepartures(data, kept, nowSec, destAirport),
          9_000,
          [] as Itinerary[],
        );
        for (const it of extra) {
          it.score = it.arrivalUnix - nowSec + rankPenaltySec(it, { airportShort: stopsShortOfAirport(it, destAirport) });
        }
        laterAdded = extra.length;
        kept = [...kept, ...extra].sort((a, b) => a.score - b.score);
      } catch (err) {
        log.warn("later departures skipped", { err: (err as Error).message });
      }
    }
    const top = kept.slice(0, TOP_K);

    // Wave 2.2 — accessibility weighting on the top set. Kerb stops already
    // dropped above when the rider asked for step-free.
    if (data.a11y) {
      applyAccessibilityWeights(top, {
        stepFree: !!data.a11y.stepFree,
        preferShade: !!data.a11y.preferShade,
        lowFloor: !!data.a11y.lowFloor,
        maxWalkMeters: data.a11y.maxWalkMeters ?? null,
      });
      top.sort((a, b) => a.score - b.score);
    }

    // Wave 2.4 — attach "Why this route?" rationale tags to each top option.
    annotateRationales(top);

    return {
      itineraries: top,
      searchedAt: Math.floor(Date.now() / 1000),
      elapsedMs: Date.now() - t0,
      mode,
      noScheduleAvailable: noScheduleAvailable && top.length === 0 ? true : undefined,
      requestedDate: noScheduleAvailable ? requestedDate : undefined,
      diagnostics: data.debug
        ? {
            live: liveResult?.diagnostics,
            scheduled: schedResult?.diagnostics,
            mergedRaw,
            dropped,
            afterDedup,

            prunedMediocre,
            laterAdded,
            finalCount: top.length,
          }
        : undefined,
    };
  });
