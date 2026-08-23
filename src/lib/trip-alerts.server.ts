// Push-alert payload construction and delivery for active trips.
//
// Extracted from the /api/public/trip-alerts route so the route file stays a
// thin scheduler: this module owns the notification copy and the two delivery
// channels (Web Push for browsers/PWAs, Expo Push for the native apps).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWebPush, type WebPushPayload } from "@/lib/webpush.server";
import { sendExpoPush } from "@/lib/expopush.server";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
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
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:notifications@aloya.app";

  let sent = 0;
  let expired = 0;

  // ---- Web push (browsers / installed PWAs) ----
  if (priv) {
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("device_id", deviceId);
    if (subs && subs.length > 0) {
      for (const s of subs) {
        try {
          const r = await sendWebPush({
            subscription: { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload,
            vapidPublicKey: VAPID_PUBLIC_KEY,
            vapidPrivateKey: priv,
            vapidSubject: sub,
          });
          if (r.ok) sent++;
          else if (r.expired) {
            expired++;
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        } catch (e) {
          log.error("web push dispatch threw", e);
        }
      }
    }
  }

  // ---- Native push via Expo (iOS/Android) ----
  try {
    const { data: tokens } = await supabaseAdmin
      .from("expo_push_tokens")
      .select("expo_token")
      .eq("device_id", deviceId);
    if (tokens && tokens.length > 0) {
      const r = await sendExpoPush(
        tokens.map((t) => ({
          to: t.expo_token,
          title: payload.title,
          body: payload.body,
          channelId: "trip-alerts",
          sound: "default",
          priority: payload.requireInteraction ? "high" : "default",
          data: { url: payload.url, tag: payload.tag },
        })),
      );
      sent += r.ok;
      if (r.expiredTokens.length) {
        expired += r.expiredTokens.length;
        await supabaseAdmin.from("expo_push_tokens").delete().in("expo_token", r.expiredTokens);
      }
      if (r.errors.length) {
        log.warn("expo push errors", { errors: r.errors.slice(0, 3) });
      }
    }
  } catch (e) {
    log.error("expo dispatch threw", e);
  }

  return { sent, expired };
}
