// Wave 3 — Last-mile trip chaining.
//
// When a bus itinerary's final walk to the destination is long, or when
// the rider arrives after-hours and any walk feels unsafe in the dark,
// surface a taxi / rideshare handoff for the last leg instead of
// pretending a 20-minute walk in the rain is a good answer.
//
// Honesty rules:
//   - Real driving ETA from Google Routes (TRAFFIC_AWARE). No haversine
//     fallback — if we can't get a real ETA, we don't show the card.
//   - Fare ranges are derived from Cyprus's regulated taxi tariff:
//       Flag-fall €3.42, then €0.85/km (06:00–20:30) or €1.05/km night.
//       Minimum fare €5. We show ±15% to cover surge / Bolt variance.
//   - Trigger gates are conservative: long walk only, or moderate walk
//     after-hours. We never push a taxi over a comfortable bus answer.
//
// Cyprus time is EET (UTC+2) winter / EEST (UTC+3) summer. The arrival
// hour gate uses Intl.DateTimeFormat in the Asia/Nicosia zone so DST
// doesn't break the "after 21:00" rule.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { drivingRoute } from "./maps.server";
import { distanceM } from "./geo";
import {
  TAXI_DISPATCHER_TEL,
  taxiNightAt,
  taxiQuoteFromDrive,
} from "@aloya/core/taxi-quote";

const Pt = z.object({
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  name: z.string().max(200).optional(),
});

const InputSchema = z.object({
  alight: Pt,
  destination: Pt,
  /** Optional UNIX seconds when the rider arrives at the alight stop. */
  arrivalUnix: z.number().int().positive().nullable().optional(),
  /** When the bus planner already measured the final walk distance, pass it
   *  through so we don't double-count. */
  finalWalkMeters: z.number().min(0).max(100_000).nullable().optional(),
});

export type LastMileChainTrigger = "long-walk" | "late-night" | "long-late";

export type LastMileChainSuggestion = {
  trigger: LastMileChainTrigger;
  drivingSec: number;
  distanceMeters: number;
  /** Estimated walk seconds (straight-line × 1.3 ÷ 1.3 m/s). For contrast copy. */
  walkSec: number;
  fareLow: number;
  fareHigh: number;
  isNightRate: boolean;
  /** Localised label of the alight stop, echoed back for the UI. */
  fromName: string;
  toName: string;
  /** Deep links — open in the rider's preferred surface. */
  boltDeepLink: string;
  mapsDeepLink: string;
  /** Cyprus 24/7 dispatcher fallback (free to call). */
  telDispatcher: string;
};

// Triggers (meters).
const LONG_WALK_M = 1500;
const MODERATE_WALK_M = 800;
// Late hours in Cyprus local time (inclusive start, exclusive end).
const LATE_START_HOUR = 21;
const LATE_END_HOUR = 6;

function cyprusHour(unix: number): number {
  // Intl handles DST for Asia/Nicosia (EET / EEST) automatically.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hour12: false,
    timeZone: "Asia/Nicosia",
  });
  const hh = parseInt(fmt.format(new Date(unix * 1000)), 10);
  return Number.isFinite(hh) ? hh : new Date(unix * 1000).getUTCHours();
}

function isLateLocal(hour: number) {
  return hour >= LATE_START_HOUR || hour < LATE_END_HOUR;
}

function chooseTrigger(
  walkMeters: number,
  arrivalUnix: number | null | undefined,
): LastMileChainTrigger | null {
  const hour = arrivalUnix ? cyprusHour(arrivalUnix) : null;
  const late = hour !== null && isLateLocal(hour);
  if (walkMeters >= LONG_WALK_M && late) return "long-late";
  if (walkMeters >= LONG_WALK_M) return "long-walk";
  if (walkMeters >= MODERATE_WALK_M && late) return "late-night";
  return null;
}

function boltLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  // Bolt's universal "request a ride" link. Falls back to the website
  // when the app isn't installed.
  const params = new URLSearchParams({
    "pickup[latitude]": String(from.lat),
    "pickup[longitude]": String(from.lng),
    "destination[latitude]": String(to.lat),
    "destination[longitude]": String(to.lng),
  });
  return `https://bolt.eu/o/${from.lat},${from.lng}/?${params.toString()}`;
}

function mapsLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
}

export const suggestLastMileChain = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof InputSchema>) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<LastMileChainSuggestion | null> => {
    const walkMeters =
      data.finalWalkMeters && data.finalWalkMeters > 0
        ? data.finalWalkMeters
        : distanceM(data.alight, data.destination) * 1.3;

    const trigger = chooseTrigger(walkMeters, data.arrivalUnix ?? null);
    if (!trigger) return null;

    // Real driving ETA. If Google fails, we'd be guessing — bail.
    const drive = await drivingRoute(data.alight, data.destination);
    if (!drive) return null;
    const arrival = data.arrivalUnix ?? Math.floor(Date.now() / 1000);
    const quote = taxiQuoteFromDrive(drive, taxiNightAt(arrival));
    if (!quote) return null;

    const walkSec = Math.round(walkMeters / 1.3); // 1.3 m/s pace.

    return {
      trigger,
      drivingSec: drive.durationSec,
      distanceMeters: quote.distanceMeters,
      walkSec,
      fareLow: quote.fareLow,
      fareHigh: quote.fareHigh,
      isNightRate: quote.night,
      fromName: data.alight.name ?? "",
      toName: data.destination.name ?? "",
      boltDeepLink: boltLink(data.alight, data.destination),
      mapsDeepLink: mapsLink(data.alight, data.destination),
      telDispatcher: TAXI_DISPATCHER_TEL,
    };
  });
