// Push-alert payload construction and delivery for active trips.
//
// Extracted from the /api/public/trip-alerts route so the route file stays a
// thin scheduler: this module owns the notification copy and the two delivery
// channels (Web Push for browsers/PWAs, Expo Push for the native apps).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { WebPushPayload } from "@/lib/webpush.server";
import { deliver } from "@/lib/notify.server";
import { createLogger } from "@/lib/logger";
import type { Leg } from "@/lib/itinerary-types";

const log = createLogger("trip-alerts:dispatch");

export type ActiveTripRow = {
  device_id: string;
  trip_id: string;
  route_short: string | null;
  board_stop_id: string | null;
  board_name: string | null;
  board_unix: number | null;
  alight_stop_id: string | null;
  alight_name: string | null;
  alight_unix: number | null;
  walk_in_sec: number;
  walk_out_sec: number;
  alerts_sent: string[];
  legs: Leg[] | null;
  total_arrival_unix: number | null;
};

export type SingleLegKind =
  "board-soon" | "hurry-soft" | "at-stop" | "alight-soon" | "arrived" | "delayed";

export function buildPayload(
  kind: SingleLegKind,
  row: ActiveTripRow,
  minutes: number,
): WebPushPayload {
  const bus = row.route_short ? `BUS ${row.route_short}` : "Your bus";
  const board = row.board_name ?? "your stop";
  const alight = row.alight_name ?? "your stop";
  const url = `/trip/${row.trip_id}`;

  switch (kind) {
    case "board-soon":
      return {
        title: `${bus} arrives in ${minutes} min`,
        body: `Head to ${board}.`,
        tag: `aloya-board-soon-${row.trip_id}`,
        url,
        requireInteraction: true,
      };
    case "hurry-soft":
      return {
        title: `Pick up the pace`,
        body: `${bus} reaches ${board} in ${minutes} min.`,
        tag: `aloya-hurry-${row.trip_id}`,
        url,
        requireInteraction: true,
      };
    case "at-stop":
      return {
        title: `${bus} is at ${board}`,
        body: `Board now.`,
        tag: `aloya-at-stop-${row.trip_id}`,
        url,
        requireInteraction: true,
      };
    case "alight-soon":
      return {
        title: `${alight} in ${minutes} min`,
        body: `Get ready to press the stop button.`,
        tag: `aloya-alight-soon-${row.trip_id}`,
        url,
        requireInteraction: true,
      };
    case "arrived":
      return {
        title: `You should be at ${alight}`,
        body: `Tap to wrap up your trip.`,
        tag: `aloya-arrived-${row.trip_id}`,
        url,
      };
    case "delayed":
      return {
        title: `${bus} is running late`,
        body: `New arrival in ~${minutes} min at ${board}.`,
        tag: `aloya-delayed-${row.trip_id}`,
        url,
      };
  }
}

export async function dispatch(deviceId: string, payload: WebPushPayload) {
  const receipt = await deliver(
    { deviceId },
    {
      category: "trip-alert",
      title: String(payload.title ?? "Aloya"),
      body: String(payload.body ?? ""),
      tag: String(payload.tag ?? `aloya-trip-${deviceId}`),
      url: payload.url,
      requireInteraction: payload.requireInteraction === true,
    },
  );
  return { sent: receipt.sent, expired: receipt.pruned };
}
