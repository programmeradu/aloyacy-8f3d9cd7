// No-show rates and last-bus. Pure — no clock, no I/O.
// Trip IDs churn when the GTFS feed regenerates, so we count by
// (route, Cyprus hour, weekday vs weekend), not by trip_id.

import { cyAddDays, cyHourDow, cyIsWeekend } from "./cy-time";

export const NO_SHOW_WINDOW_DAYS = 30;
export const NO_SHOW_MIN_MISSED = 3;
export const NO_SHOW_MIN_DAYS_WEEKDAY = 10;
export const NO_SHOW_MIN_DAYS_WEEKEND = 4;
/** Only name last-bus this late. The live snapshot is ~90 min; before
 *  21:00 a later trip can sit outside that window. Fail closed. */
export const LAST_BUS_HOUR = 21;

export type NoShowRow = {
  route_id: string;
  detected_at: string;
  hour_of_day: number | null;
  day_of_week: number | null;
};

export type NoShowSlot = {
  routeId: string;
  hour: number;
  weekend: boolean;
  missed: number;
};

export function noShowSlotKey(routeId: string, hour: number, weekend: boolean): string {
  return `${routeId}|${hour}|${weekend ? "w" : "d"}`;
}

function hourOf(row: NoShowRow): number {
  if (row.hour_of_day != null && row.hour_of_day >= 0 && row.hour_of_day <= 23) {
    return row.hour_of_day;
  }
  return cyHourDow(new Date(row.detected_at).getTime()).hour;
}

function weekendOf(row: NoShowRow): boolean {
  if (row.day_of_week != null) return row.day_of_week === 0 || row.day_of_week === 6;
  return cyIsWeekend(new Date(row.detected_at).getTime());
}

export function tallyNoShows(rows: NoShowRow[]): Map<string, NoShowSlot> {
  const out = new Map<string, NoShowSlot>();
  for (const row of rows) {
    if (!row.route_id) continue;
    const hour = hourOf(row);
    const weekend = weekendOf(row);
    const key = noShowSlotKey(row.route_id, hour, weekend);
    const slot = out.get(key) ?? { routeId: row.route_id, hour, weekend, missed: 0 };
    slot.missed += 1;
    out.set(key, slot);
  }
  return out;
}

export function countDaysOfKind(nowMs: number, windowDays: number, weekend: boolean): number {
  let n = 0;
  for (let i = 1; i <= windowDays; i++) {
    if (cyIsWeekend(cyAddDays(nowMs, -i)) === weekend) n += 1;
  }
  return n;
}

export function shouldSpeakNoShow(missed: number, days: number, weekend: boolean): boolean {
  if (missed < NO_SHOW_MIN_MISSED) return false;
  const minDays = weekend ? NO_SHOW_MIN_DAYS_WEEKEND : NO_SHOW_MIN_DAYS_WEEKDAY;
  return days >= minDays;
}

export function isLastTonight(hourCy: number, laterOnRoute: number): boolean {
  return laterOnRoute === 0 && hourCy >= LAST_BUS_HOUR;
}

/** Cyprus hour of a unix-seconds arrival, for matching a slot. */
export function arrivalHourWeekend(arrivalUnix: number): { hour: number; weekend: boolean } {
  const ms = arrivalUnix * 1000;
  const { hour } = cyHourDow(ms);
  return { hour, weekend: cyIsWeekend(ms) };
}

export function pickNoShow(
  slots: NoShowSlot[],
  routeId: string,
  arrivalUnix: number,
  nowMs: number,
): { missed: number; days: number; weekend: boolean } | null {
  const { hour, weekend } = arrivalHourWeekend(arrivalUnix);
  const slot = slots.find((s) => s.routeId === routeId && s.hour === hour && s.weekend === weekend);
  if (!slot) return null;
  const days = countDaysOfKind(nowMs, NO_SHOW_WINDOW_DAYS, weekend);
  if (!shouldSpeakNoShow(slot.missed, days, weekend)) return null;
  return { missed: slot.missed, days, weekend };
}

export function lastTonightOnRoute(
  arrivals: { stopId: string; routeId: string; arrivalUnix: number }[],
  stopId: string,
  routeId: string,
  thisArrivalUnix: number,
): boolean {
  let later = 0;
  for (const a of arrivals) {
    if (a.stopId === stopId && a.routeId === routeId && a.arrivalUnix > thisArrivalUnix) later += 1;
  }
  return isLastTonight(arrivalHourWeekend(thisArrivalUnix).hour, later);
}
