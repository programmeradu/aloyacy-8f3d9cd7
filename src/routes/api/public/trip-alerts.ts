// Background scheduler for trip push alerts.
//
// Called by pg_cron every minute. Reads all active trips, fuses them with
// the live realtime feed, and dispatches notifications for phase transitions
// the rider has not been alerted about yet. Idempotent via the
// `alerts_sent` text[] on each row.
//
// Secured with a shared header (`x-cron-secret`) — this endpoint can move
// real money in user attention (pushing to a phone), so we don't want it
// callable from the open internet.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchRealtime } from "@/lib/gtfs-rt.server";
import { sendWebPush, type WebPushPayload } from "@/lib/webpush.server";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

import type { Leg, RideLeg } from "@/lib/itinerary-types";

type ActiveTripRow = {
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

type AlertKind =
  | "board-soon"
  | "hurry-soft"
  | "at-stop"
  | "alight-soon"
  | "arrived"
  | "delayed"
  // Multi-leg additions:
  | "alight-leg"          // get off at next stop, for ride leg i
  | "walk-to-transfer"    // walk this way to next stop, after alighting leg i
  | "connection-approaching" // next bus is < ~90s out at transfer stop
  | "connection-delayed";  // next leg is running > 5 min late


type SingleLegKind =
  | "board-soon"
  | "hurry-soft"
  | "at-stop"
  | "alight-soon"
  | "arrived"
  | "delayed";

function buildPayload(
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

async function dispatch(deviceId: string, payload: WebPushPayload) {
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:notifications@aloya.app";
  if (!priv) return { sent: 0, expired: 0 };

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("device_id", deviceId);
  if (!subs || subs.length === 0) return { sent: 0, expired: 0 };

  let sent = 0;
  let expired = 0;
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
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", s.endpoint);
      }
    } catch (e) {
      console.error("[trip-alerts] dispatch threw", e);
    }
  }
  return { sent, expired };
}

async function processTrips() {
  const now = Math.floor(Date.now() / 1000);

  // Pull any trip that hasn't completed yet (alight time + 10 min grace).
  const cutoff = now - 60 * 10;
  const { data: trips, error } = await supabaseAdmin
    .from("active_trips")
    .select(
      "device_id, trip_id, route_short, board_stop_id, board_name, board_unix, alight_stop_id, alight_name, alight_unix, walk_in_sec, walk_out_sec, alerts_sent",
    )
    .or(`alight_unix.is.null,alight_unix.gte.${cutoff}`);

  if (error) {
    console.error("[trip-alerts] read failed", error);
    return { processed: 0, dispatched: 0, error: error.message };
  }
  if (!trips || trips.length === 0) return { processed: 0, dispatched: 0 };

  // Pull live feed once for the whole batch.
  let arrivalsByKey = new Map<string, { arrivalUnix: number; delaySec: number }>();
  try {
    const rt = await fetchRealtime();
    for (const a of rt.arrivals) {
      arrivalsByKey.set(`${a.tripId}::${a.stopId}`, {
        arrivalUnix: a.arrivalUnix,
        delaySec: a.delaySec,
      });
    }
  } catch (e) {
    console.warn("[trip-alerts] realtime fetch failed; using scheduled times", e);
  }

  let dispatched = 0;

  for (const row of trips as ActiveTripRow[]) {
    const sent = new Set(row.alerts_sent ?? []);
    const liveBoard =
      row.board_stop_id
        ? arrivalsByKey.get(`${row.trip_id}::${row.board_stop_id}`)
        : undefined;
    const liveAlight =
      row.alight_stop_id
        ? arrivalsByKey.get(`${row.trip_id}::${row.alight_stop_id}`)
        : undefined;

    const boardUnix = liveBoard?.arrivalUnix ?? row.board_unix ?? 0;
    const alightUnix = liveAlight?.arrivalUnix ?? row.alight_unix ?? 0;

    const secsToBoard = boardUnix - now;
    const secsToAlight = alightUnix - now;
    const minToBoard = Math.max(0, Math.round(secsToBoard / 60));
    const minToAlight = Math.max(0, Math.round(secsToAlight / 60));

    const fire: Array<{ kind: AlertKind; minutes: number }> = [];

    // Walk-out warning: leave-by trigger ~3 min before they should start walking.
    const leaveByUnix = boardUnix - row.walk_in_sec;
    const secsToLeave = leaveByUnix - now;
    if (
      !sent.has("board-soon") &&
      boardUnix > 0 &&
      secsToLeave <= 3 * 60 &&
      secsToLeave >= -60
    ) {
      fire.push({ kind: "board-soon", minutes: minToBoard });
    }

    // Hurry — bus arrives in ≤ 2 min and they're (likely) still walking.
    if (
      !sent.has("hurry-soft") &&
      boardUnix > 0 &&
      secsToBoard <= 2 * 60 &&
      secsToBoard > 30
    ) {
      fire.push({ kind: "hurry-soft", minutes: minToBoard });
    }

    // At stop — bus is at the boarding point right now.
    if (
      !sent.has("at-stop") &&
      boardUnix > 0 &&
      secsToBoard <= 30 &&
      secsToBoard >= -60
    ) {
      fire.push({ kind: "at-stop", minutes: 0 });
    }

    // Delay warning — feed indicates >5 min delay we haven't told them about.
    const delaySec = liveBoard?.delaySec ?? liveAlight?.delaySec ?? 0;
    if (!sent.has("delayed") && delaySec >= 5 * 60 && secsToBoard > 60) {
      fire.push({ kind: "delayed", minutes: minToBoard });
    }

    // Alight soon — 2 min before scheduled alight.
    if (
      !sent.has("alight-soon") &&
      alightUnix > 0 &&
      secsToAlight <= 2 * 60 &&
      secsToAlight > -60
    ) {
      fire.push({ kind: "alight-soon", minutes: minToAlight });
    }

    // Arrived at destination stop.
    if (!sent.has("arrived") && alightUnix > 0 && secsToAlight <= -30) {
      fire.push({ kind: "arrived", minutes: 0 });
    }

    if (fire.length === 0) continue;

    for (const f of fire) {
      const payload = buildPayload(f.kind, row, f.minutes);
      const r = await dispatch(row.device_id, payload);
      if (r.sent > 0) {
        dispatched += r.sent;
        sent.add(f.kind);
      }
    }

    await supabaseAdmin
      .from("active_trips")
      .update({
        alerts_sent: Array.from(sent),
        updated_at: new Date().toISOString(),
      })
      .eq("device_id", row.device_id);
  }

  return { processed: trips.length, dispatched };
}

async function getExpectedSecret(): Promise<string | null> {
  // Prefer the vault-managed value (written by the cron-schedule migration);
  // fall back to a project-level env var for local/dev runs.
  try {
    const { data } = await supabaseAdmin
      .schema("vault" as never)
      .from("decrypted_secrets" as never)
      .select("decrypted_secret")
      .eq("name", "aloya_cron_secret")
      .maybeSingle();
    const v = (data as { decrypted_secret?: string } | null)?.decrypted_secret;
    if (v) return v;
  } catch (e) {
    console.warn("[trip-alerts] vault lookup failed", e);
  }
  return process.env.CRON_SECRET ?? null;
}

export const Route = createFileRoute("/api/public/trip-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = await getExpectedSecret();
        const header = request.headers.get("x-cron-secret");
        if (!expected || header !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await processTrips();
          return Response.json(result);
        } catch (e) {
          console.error("[trip-alerts] failed", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
