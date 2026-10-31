// Pure schedule types and the service-date clock, shared by the Worker loader
// and the browser planner (which must never import a *.server module).

import { cyWallToMs } from "@aloya/core/cy-time";

export type ScheduleStop = { name: string; lat: number; lng: number; feedId: number };
export type ScheduleRoute = {
  short: string;
  long: string;
  color: string;
  feedId: number;
  type: number;
};
export type ScheduleTrip = {
  routeId: string;
  serviceId: string;
  direction: 0 | 1;
  headsign: string;
  feedId: number;
};
export type StopTimeRow = [string, number, number, number]; // [stopId, depSec, arrSec, seq]
export type StopTripRow = [string, number, string]; // [tripId, depSec, routeId]

export type LoadedSchedule = {
  date: string;
  stops: Record<string, ScheduleStop>;
  routes: Record<string, ScheduleRoute>;
  trips: Record<string, ScheduleTrip>;
  stopTrips: Record<string, StopTripRow[]>;
  stopTimes: Record<string, StopTimeRow[]>;
};

/** Convert seconds-since-service-midnight + service date → unix seconds.
 *  GTFS values may exceed 86400 (post-midnight on the same operating day).
 *  The date is YYYYMMDD in Cyprus local time; GTFS times count from "noon
 *  minus 12h" of the service day, which keeps DST changeover days exact, and
 *  the offset is DST-aware (UTC+2 winter, UTC+3 summer).
 *
 *  The search calls this for every stop time it touches, and the zone maths
 *  (Intl formatToParts) cost ~20 µs a call, so the day's midnight is computed
 *  once per date and reused. */
const _midnightByDate = new Map<string, number>();
export function serviceDateToUnix(date: string, secSinceMidnight: number): number {
  let midnight = _midnightByDate.get(date);
  if (midnight === undefined) {
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(4, 6));
    const d = Number(date.slice(6, 8));
    midnight = Math.floor((cyWallToMs(y, m, d, 12, 0) - 12 * 3600 * 1000) / 1000);
    if (_midnightByDate.size > 64) _midnightByDate.clear();
    _midnightByDate.set(date, midnight);
  }
  return midnight + secSinceMidnight;
}
