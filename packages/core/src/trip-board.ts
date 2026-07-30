// Pure logic behind the "trip info" board (one vehicle running one trip).
//
// Shared by the web route (`src/routes/trip-info.$tripId.tsx`) and the mobile
// screen (`mobile/app/trip-info/[tripId].tsx`) so both surfaces agree on:
//   - stop ordering and which stop is "next"
//   - passed / next / upcoming tagging
//   - running status (on time / late / early / finished) and its copy
//   - route length and the vehicle fleet label
//
// Everything here is deterministic: callers pass `nowUnix` explicitly.

import { distanceM, type LatLng } from "./geo";

export interface TripArrivalInput {
  stopId: string;
  tripId: string;
  routeId: string;
  arrivalUnix: number;
  delaySec: number;
}

export interface TripStopMeta {
  name: string;
  code?: string;
  lat: number;
  lng: number;
}

export interface TripBoardStop<M extends TripStopMeta = TripStopMeta> {
  stopId: string;
  routeId: string;
  arrivalUnix: number;
  delaySec: number;
  meta?: M;
  /** Vehicle has already served this stop. */
  passed: boolean;
  /** The stop the vehicle is approaching right now. */
  next: boolean;
  /** Zero-based position in the ordered stop list. */
  index: number;
}

export interface TripBoard<M extends TripStopMeta = TripStopMeta> {
  routeId: string;
  stops: TripBoardStop<M>[];
  /** Index of the next un-served stop, or -1 when the trip has finished. */
  nextIdx: number;
}

/**
 * Stops served within this many seconds of `now` still count as "next" — GTFS
 * predictions lag the vehicle slightly, so a stop whose time just passed is
 * usually still being approached.
 */
export const NEXT_STOP_GRACE_SEC = 30;

/** Delay smaller than this (either direction) reads as "on time". */
export const ON_TIME_TOLERANCE_SEC = 60;

/**
 * Build the ordered board for one trip. Returns `null` when the trip has no
 * arrivals in the feed (finished, or between scheduled runs).
 */
export function buildTripBoard<M extends TripStopMeta>(
  arrivals: TripArrivalInput[],
  tripId: string,
  nowUnix: number,
  resolveStop: (stopId: string) => M | undefined,
): TripBoard<M> | null {
  const ordered = arrivals
    .filter((a) => a.tripId === tripId)
    .sort((a, b) => a.arrivalUnix - b.arrivalUnix);
  if (ordered.length === 0) return null;

  const nextIdx = ordered.findIndex(
    (a) => a.arrivalUnix >= nowUnix - NEXT_STOP_GRACE_SEC,
  );

  const stops = ordered.map((a, i) => ({
    stopId: a.stopId,
    routeId: a.routeId,
    arrivalUnix: a.arrivalUnix,
    delaySec: a.delaySec,
    meta: resolveStop(a.stopId),
    passed: nextIdx === -1 ? true : i < nextIdx,
    next: i === nextIdx,
    index: i,
  }));

  return { routeId: ordered[0].routeId, stops, nextIdx };
}

/** Total distance along the trip's stop sequence, in kilometres. */
export function tripLengthKm(stops: Array<{ meta?: TripStopMeta }>): number {
  let m = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1].meta;
    const b = stops[i].meta;
    if (a && b) m += distanceM(a as LatLng, b as LatLng);
  }
  return m / 1000;
}

/**
 * Cyprus operators sometimes stuff the internal entity id into the vehicle
 * label. Only surface it when it looks like a real fleet number.
 */
export function fleetLabel(raw: string | null | undefined): string {
  const v = raw?.trim();
  const isFleet = !!v && v.length >= 2 && v.length <= 6 && /^[A-Z0-9-]+$/i.test(v);
  return isFleet ? `Bus ${v}` : "Live trip";
}

export type TripRunStatus = "ontime" | "late" | "early" | "done";

export interface TripStatusView {
  status: TripRunStatus;
  /** Headline copy, e.g. "4 min late". */
  label: string;
  /** Short uppercase tag under the headline. */
  tag: string;
  /** Whole minutes late (positive) or early (negative); 0 when on time/done. */
  minutes: number;
}

export function tripStatusView(
  delaySec: number,
  finished: boolean,
): TripStatusView {
  if (finished) return { status: "done", label: "Finished", tag: "end", minutes: 0 };
  if (delaySec > ON_TIME_TOLERANCE_SEC) {
    const minutes = Math.round(delaySec / 60);
    return { status: "late", label: `${minutes} min late`, tag: "delayed", minutes };
  }
  if (delaySec < -ON_TIME_TOLERANCE_SEC) {
    const minutes = Math.round(delaySec / 60);
    return {
      status: "early",
      label: `${Math.abs(minutes)} min early`,
      tag: "ahead",
      minutes,
    };
  }
  return { status: "ontime", label: "On time", tag: "steady", minutes: 0 };
}

/** Whole minutes until an arrival, floored at zero. */
export function minutesUntil(arrivalUnix: number, nowUnix: number): number {
  return Math.max(0, Math.round((arrivalUnix - nowUnix) / 60));
}

/** Delay badge copy for a single stop row, or null when within tolerance. */
export function stopDelayBadge(delaySec: number): string | null {
  if (Math.abs(delaySec) <= ON_TIME_TOLERANCE_SEC) return null;
  const m = Math.round(delaySec / 60);
  return m > 0 ? `+${m}m` : `${m}m`;
}

/**
 * Meta line under the trip title: stop count, route length, terminus.
 * Joined with a spaced separator that avoids decorative bullet characters.
 */
export function tripMetaLine(
  stopCount: number,
  km: number | null,
  terminus: string | null,
): string {
  const parts = [`${stopCount} ${stopCount === 1 ? "stop" : "stops"}`];
  if (km != null && km > 0.05) parts.push(`${km.toFixed(1)} km of route`);
  if (terminus) parts.push(`ends at ${terminus}`);
  return parts.join("   ");
}
