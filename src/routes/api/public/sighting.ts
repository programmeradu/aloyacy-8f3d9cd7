// Rider-confirmed bus sighting endpoint.
//
// A rider standing at a stop sees a bus that the app says has no GPS
// ("ghost"). They tap "I see this bus" and we record a sighting. The
// realtime snapshot folds recent sightings into a `riderConfirmedTrips`
// set, which:
//   - removes that trip from `ghostTripIds`, and
//   - lets the shared freshness classifier upgrade the trip to the
//     `rider-confirmed` tier for ~90s.
//
// Trust model: device-scoped (no auth required). The cost of a malicious
// sighting is small (90s window of softened messaging) and we keep it
// bounded by:
//   - rate-limit: 1 sighting per device + trip per 45s,
//   - bounds check: lat/lng must be in Cyprus,
//   - cleanup: rows older than 10 min are deleted server-side.
//
// We never expose this table to clients directly.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const RATE_LIMIT_SEC = 45;
const TRUST_WINDOW_SEC = 90;
const UNDO_WINDOW_SEC = 15;

const Body = z.object({
  deviceId: z.string().min(8).max(128),
  tripId: z.string().min(1).max(128),
  routeId: z.string().min(1).max(128).optional(),
  stopId: z.string().min(1).max(128).optional(),
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
});

const UndoBody = z.object({
  deviceId: z.string().min(8).max(128),
  tripId: z.string().min(1).max(128),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function summarizeTrip(tripId: string) {
  const cutoff = new Date(Date.now() - TRUST_WINDOW_SEC * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("bus_sightings")
    .select("device_id, reported_at")
    .eq("trip_id", tripId)
    .gte("reported_at", cutoff)
    .limit(200);
  const now = Date.now();
  const devices = new Set<string>();
  let mostRecent = 0;
  for (const r of data ?? []) {
    devices.add(r.device_id);
    const ts = new Date(r.reported_at).getTime();
    if (ts > mostRecent) mostRecent = ts;
  }
  const ageSec = mostRecent
    ? Math.max(0, Math.floor((now - mostRecent) / 1000))
    : TRUST_WINDOW_SEC;
  const recency = Math.max(0, 1 - ageSec / TRUST_WINDOW_SEC);
  const density = Math.min(1, devices.size / 3);
  const confidence = Math.round((0.35 * recency + 0.65 * density) * 100) / 100;
  return { count: devices.size, confidence, ageSec };
}

export const Route = createFileRoute("/api/public/sighting")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return json(400, { error: "Invalid payload" });
        }

        // Rate limit: reject if this device sighted this trip recently.
        const cutoff = new Date(
          Date.now() - RATE_LIMIT_SEC * 1000,
        ).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("bus_sightings")
          .select("id")
          .eq("device_id", parsed.deviceId)
          .eq("trip_id", parsed.tripId)
          .gte("reported_at", cutoff)
          .limit(1);
        if (recent && recent.length > 0) {
          const summary = await summarizeTrip(parsed.tripId);
          return json(200, { ok: true, dedup: true, ...summary });
        }

        const { error: insErr } = await supabaseAdmin
          .from("bus_sightings")
          .insert({
            trip_id: parsed.tripId,
            route_id: parsed.routeId ?? null,
            stop_id: parsed.stopId ?? null,
            lat: parsed.lat,
            lng: parsed.lng,
            device_id: parsed.deviceId,
          });
        if (insErr) {
          return json(500, { error: "insert failed" });
        }

        // Best-effort sweep (don't block).
        void supabaseAdmin.rpc("cleanup_bus_sightings").then(
          () => {},
          () => {},
        );

        const summary = await summarizeTrip(parsed.tripId);
        return json(200, { ok: true, ...summary });
      },
      // Undo — delete this device's very recent sighting for a trip so a
      // mis-tap doesn't linger in the trust window.
      DELETE: async ({ request }) => {
        let parsed;
        try {
          parsed = UndoBody.parse(await request.json());
        } catch {
          return json(400, { error: "Invalid payload" });
        }
        const cutoff = new Date(
          Date.now() - UNDO_WINDOW_SEC * 1000,
        ).toISOString();
        const { error } = await supabaseAdmin
          .from("bus_sightings")
          .delete()
          .eq("device_id", parsed.deviceId)
          .eq("trip_id", parsed.tripId)
          .gte("reported_at", cutoff);
        if (error) return json(500, { error: "delete failed" });
        const summary = await summarizeTrip(parsed.tripId);
        return json(200, { ok: true, ...summary });
      },
    },
  },
});
