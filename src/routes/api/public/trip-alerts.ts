// Background scheduler for trip push alerts.
//
// Called by pg_cron every minute. Reads all active trips, fuses them with
// the live realtime feed, and dispatches notifications for phase transitions
// the rider has not been alerted about yet. Idempotent via the
// `alerts_sent` text[] on each row.
//
// Secured for scheduled backend callers via the project publishable key
// (canonical pg_cron pattern), with a CRON_SECRET bearer fallback for
// local/dev compatibility.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchRealtime } from "@/lib/gtfs-rt.server";
import type { WebPushPayload } from "@/lib/webpush.server";
import { createLogger } from "@/lib/logger";
import {
  buildPayload,
  currentRideTripId,
  dispatch,
  type ActiveTripRow,
  type SingleLegKind,
} from "@/lib/trip-alerts.server";
import { shouldPushStillOnBoard, STILL_ON_ALERT } from "@aloya/core/multileg-banners";
import { TripAlertsTickSchema } from "@/lib/schemas/public-api";

import type { RideLeg } from "@/lib/itinerary-types";

const log = createLogger("trip-alerts");

async function processTrips(limit?: number) {
  const now = Math.floor(Date.now() / 1000);

  // Pull any trip that hasn't completed yet (alight time + 10 min grace).
  const cutoff = now - 60 * 10;
  const { data: trips, error } = await supabaseAdmin
    .from("active_trips")
    .select(
      "device_id, trip_id, route_short, board_stop_id, board_name, board_unix, alight_stop_id, alight_name, alight_unix, walk_in_sec, walk_out_sec, alerts_sent, legs, total_arrival_unix",
    )
    .or(`alight_unix.is.null,alight_unix.gte.${cutoff}`);

  if (error) {
    log.error("read failed", error);
    return { processed: 0, dispatched: 0, error: error.message };
  }
  if (!trips || trips.length === 0) return { processed: 0, dispatched: 0 };
  if (limit !== undefined && trips.length > limit) trips.length = limit;

  // Pull live feed once for the whole batch.
  const arrivalsByKey = new Map<string, { arrivalUnix: number; delaySec: number }>();
  const ghostTripIds = new Set<string>();
  const confirmedTripIds = new Set<string>();
  let staleFeed = false;
  try {
    const rt = await fetchRealtime();
    staleFeed = rt.stale === true;
    for (const id of rt.ghostTripIds ?? []) ghostTripIds.add(id);
    for (const s of rt.riderConfirmedTrips ?? []) confirmedTripIds.add(s.tripId);
    for (const a of rt.arrivals) {
      arrivalsByKey.set(`${a.tripId}::${a.stopId}`, {
        arrivalUnix: a.arrivalUnix,
        delaySec: a.delaySec,
      });
    }
  } catch (e) {
    log.warn("realtime fetch failed; using scheduled times", {
      err: e instanceof Error ? e.message : String(e),
    });
  }

  let dispatched = 0;

  for (const row of trips as ActiveTripRow[]) {
    const sent = new Set(row.alerts_sent ?? []);
    const liveBoard = row.board_stop_id
      ? arrivalsByKey.get(`${row.trip_id}::${row.board_stop_id}`)
      : undefined;
    const liveAlight = row.alight_stop_id
      ? arrivalsByKey.get(`${row.trip_id}::${row.alight_stop_id}`)
      : undefined;

    const boardUnix = liveBoard?.arrivalUnix ?? row.board_unix ?? 0;
    const alightUnix = liveAlight?.arrivalUnix ?? row.alight_unix ?? 0;

    const secsToBoard = boardUnix - now;
    const secsToAlight = alightUnix - now;
    const minToBoard = Math.max(0, Math.round(secsToBoard / 60));
    const minToAlight = Math.max(0, Math.round(secsToAlight / 60));

    const fire: Array<{ kind: SingleLegKind; minutes: number }> = [];

    // Walk-out warning: leave-by trigger ~3 min before they should start walking.
    const leaveByUnix = boardUnix - row.walk_in_sec;
    const secsToLeave = leaveByUnix - now;
    if (!sent.has("board-soon") && boardUnix > 0 && secsToLeave <= 3 * 60 && secsToLeave >= -60) {
      fire.push({ kind: "board-soon", minutes: minToBoard });
    }

    // Hurry — bus arrives in ≤ 2 min and they're (likely) still walking.
    if (!sent.has("hurry-soft") && boardUnix > 0 && secsToBoard <= 2 * 60 && secsToBoard > 30) {
      fire.push({ kind: "hurry-soft", minutes: minToBoard });
    }

    // At stop — bus is at the boarding point right now.
    if (!sent.has("at-stop") && boardUnix > 0 && secsToBoard <= 30 && secsToBoard >= -60) {
      fire.push({ kind: "at-stop", minutes: 0 });
    }

    // Delay warning — feed indicates >5 min delay we haven't told them about.
    const delaySec = liveBoard?.delaySec ?? liveAlight?.delaySec ?? 0;
    if (!sent.has("delayed") && delaySec >= 5 * 60 && secsToBoard > 60) {
      fire.push({ kind: "delayed", minutes: minToBoard });
    }

    const rideTripId = currentRideTripId(row, now);
    const tripGhost =
      !!rideTripId &&
      !confirmedTripIds.has(rideTripId) &&
      (staleFeed || ghostTripIds.has(rideTripId));
    if (
      shouldPushStillOnBoard({
        sent,
        riding: rideTripId != null,
        tripGhost,
      })
    ) {
      fire.push({ kind: STILL_ON_ALERT, minutes: 0 });
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

    // Arrived at destination stop — for multi-leg trips, suppress until the
    // final ride leg has been reached (alight_unix only reflects leg 0).
    const isMultiLegRow =
      Array.isArray(row.legs) && row.legs.filter((l) => l.kind === "ride").length >= 2;
    if (!isMultiLegRow && !sent.has("arrived") && alightUnix > 0 && secsToAlight <= -30) {
      fire.push({ kind: "arrived", minutes: 0 });
    }

    // ---------- Multi-leg additions ----------
    type LegFire = { key: string; payload: WebPushPayload };
    const legFires: LegFire[] = [];

    if (isMultiLegRow && row.legs) {
      const rideLegs = row.legs.filter((l): l is RideLeg => l.kind === "ride");
      for (let i = 0; i < rideLegs.length; i++) {
        const leg = rideLegs[i];
        const liveLegBoard = arrivalsByKey.get(`${leg.tripId}::${leg.board.stopId}`);
        const liveLegAlight = arrivalsByKey.get(`${leg.tripId}::${leg.alight.stopId}`);
        const legBoardUnix = liveLegBoard?.arrivalUnix ?? leg.board.departureUnix;
        const legAlightUnix = liveLegAlight?.arrivalUnix ?? leg.alight.arrivalUnix;
        const legDelaySec = liveLegBoard?.delaySec ?? leg.delaySec ?? 0;
        const busLabel = `BUS ${leg.routeShort}`;
        const url = `/trip/${row.trip_id}`;

        // alight-leg-i: 2 min before alighting (skip i=0; covered by single-leg "alight-soon")
        if (i >= 1) {
          const key = `alight-leg-${i}`;
          const s = legAlightUnix - now;
          if (!sent.has(key) && s <= 2 * 60 && s > -60) {
            legFires.push({
              key,
              payload: {
                title: `${leg.alight.name} in ${Math.max(0, Math.round(s / 60))} min`,
                body: `Get off ${busLabel} at the next stop.`,
                tag: `aloya-${key}-${row.trip_id}`,
                url,
                requireInteraction: true,
              },
            });
          }
        }

        // walk-to-transfer-i: at alight time of leg i, when leg i+1 exists.
        if (i < rideLegs.length - 1) {
          const nextLeg = rideLegs[i + 1];
          const key = `walk-to-transfer-${i}`;
          const s = legAlightUnix - now;
          if (!sent.has(key) && s <= 30 && s > -3 * 60) {
            legFires.push({
              key,
              payload: {
                title: `Walk to ${nextLeg.board.name}`,
                body: `Then board BUS ${nextLeg.routeShort}.`,
                tag: `aloya-${key}-${row.trip_id}`,
                url,
                requireInteraction: true,
              },
            });
          }

          // connection-approaching-i: next bus arrives in < ~90s.
          const liveNextBoard = arrivalsByKey.get(`${nextLeg.tripId}::${nextLeg.board.stopId}`);
          const nextBoardUnix = liveNextBoard?.arrivalUnix ?? nextLeg.board.departureUnix;
          const sToNext = nextBoardUnix - now;
          const keyApproach = `connection-approaching-${i}`;
          if (!sent.has(keyApproach) && sToNext <= 90 && sToNext > -60) {
            legFires.push({
              key: keyApproach,
              payload: {
                title: `BUS ${nextLeg.routeShort} is arriving`,
                body: `Your connection at ${nextLeg.board.name}.`,
                tag: `aloya-${keyApproach}-${row.trip_id}`,
                url,
                requireInteraction: true,
              },
            });
          }

          // connection-delayed-i: next leg running > 5 min late.
          const nextDelaySec = liveNextBoard?.delaySec ?? 0;
          const keyDelay = `connection-delayed-${i}`;
          if (!sent.has(keyDelay) && nextDelaySec >= 5 * 60 && sToNext > 60) {
            legFires.push({
              key: keyDelay,
              payload: {
                title: `BUS ${nextLeg.routeShort} running late`,
                body: `~${Math.round(nextDelaySec / 60)} min delay at ${nextLeg.board.name}.`,
                tag: `aloya-${keyDelay}-${row.trip_id}`,
                url,
              },
            });
          }
        }

        // Per-leg delay heads-up while waiting to board this leg.
        if (i >= 1) {
          const keyLegDelay = `leg-delayed-${i}`;
          const sToLegBoard = legBoardUnix - now;
          if (!sent.has(keyLegDelay) && legDelaySec >= 5 * 60 && sToLegBoard > 60) {
            legFires.push({
              key: keyLegDelay,
              payload: {
                title: `${busLabel} running late`,
                body: `New arrival in ~${Math.max(0, Math.round(sToLegBoard / 60))} min at ${leg.board.name}.`,
                tag: `aloya-${keyLegDelay}-${row.trip_id}`,
                url,
              },
            });
          }
        }
      }

      // Final arrival across the whole itinerary.
      const finalUnix = row.total_arrival_unix ?? 0;
      if (!sent.has("arrived") && finalUnix > 0 && finalUnix - now <= -30) {
        const lastLeg = rideLegs[rideLegs.length - 1];
        legFires.push({
          key: "arrived",
          payload: {
            title: `You should be at ${lastLeg?.alight.name ?? "your destination"}`,
            body: `Tap to wrap up your trip.`,
            tag: `aloya-arrived-${row.trip_id}`,
            url: `/trip/${row.trip_id}`,
          },
        });
      }
    }

    if (fire.length === 0 && legFires.length === 0) continue;

    for (const f of fire) {
      const payload = buildPayload(f.kind, row, f.minutes);
      const r = await dispatch(row.device_id, payload);
      if (r.sent > 0) {
        dispatched += r.sent;
        sent.add(f.kind);
      }
    }
    for (const lf of legFires) {
      const r = await dispatch(row.device_id, lf.payload);
      if (r.sent > 0) {
        dispatched += r.sent;
        sent.add(lf.key);
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

export const Route = createFileRoute("/api/public/trip-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        let legacySecret: string | null = process.env.CRON_SECRET ?? null;
        try {
          const { data } = await supabaseAdmin
            .schema("vault" as never)
            .from("decrypted_secrets" as never)
            .select("decrypted_secret")
            .eq("name", "aloya_cron_secret")
            .maybeSingle();
          legacySecret =
            (data as { decrypted_secret?: string } | null)?.decrypted_secret ?? legacySecret;
        } catch {
          // ignore vault lookup failures and fall back to env
        }
        const legacyHeader = request.headers.get("x-cron-secret");
        const validApiKey =
          apikey &&
          apikey ===
            (import.meta.env.VITE_CUSTOM_SUPABASE_ANON_KEY || process.env.CUSTOM_SUPABASE_ANON_KEY);
        const validCron = bearer && process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
        const validLegacy = legacySecret && legacyHeader && legacyHeader === legacySecret;
        if (!validApiKey && !validCron && !validLegacy) {
          return new Response("Unauthorized", { status: 401 });
        }
        // Caller input (an optional JSON body) is schema-parsed before any
        // row is read, so a malformed tick fails at the boundary. An empty
        // body is the normal cron shape and parses to the schema defaults.
        const text = (await request.text().catch(() => "")).trim();
        let raw: unknown = {};
        if (text.length > 0) {
          try {
            raw = JSON.parse(text);
          } catch {
            return Response.json({ error: "body is not valid JSON" }, { status: 400 });
          }
        }
        const body = TripAlertsTickSchema.safeParse(raw);
        if (!body.success) {
          const error = body.error.issues.map((i) => i.message).join("; ");
          return Response.json({ error }, { status: 400 });
        }

        try {
          const result = await processTrips(body.data.limit);

          return Response.json(result);
        } catch (e) {
          log.error("failed", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
