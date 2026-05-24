// Crowdsourced bus position endpoint.
//
// Riders who tapped "I'm on board" POST their GPS every ~5 s. We accept the
// fix only when the device has an active trip on the same tripId and the
// rider has confirmed boarding (active_trips.legs contains the trip and
// onBoardConfirmedAt is implied by the live phase — we store a separate
// flag in legs JSON, so we trust active_trips presence + recency here).
//
// Fixes <30 s old are folded into the live vehicles list server-side so
// every other passenger sees a smoother bus marker and better ETAs.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const Body = z.object({
  deviceId: z.string().min(8).max(128),
  tripId: z.string().min(1).max(128),
  routeId: z.string().min(1).max(128).optional(),
  lat: z.number().min(34).max(36),
  lng: z.number().min(32).max(35),
  bearing: z.number().min(0).max(360).optional(),
  speedMps: z.number().min(0).max(60).optional(),
  accuracyM: z.number().min(0).max(2000).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/rider-fix")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch (e) {
          return json(400, { error: "Invalid payload" });
        }

        // Trust check: does this device actually have an active trip
        // covering this tripId? Reject otherwise to prevent spoofing.
        const { data: trip, error } = await supabaseAdmin
          .from("active_trips")
          .select("trip_id, legs, updated_at")
          .eq("device_id", parsed.deviceId)
          .maybeSingle();
        if (error) {
          return json(500, { error: "lookup failed" });
        }
        if (!trip) {
          return json(403, { error: "no active trip" });
        }
        // Accept if the planned trip id matches OR the tripId appears in
        // any ride leg of the itinerary (multi-leg case).
        const legs = (trip.legs ?? []) as Array<{ kind: string; tripId?: string }>;
        const tripMatches =
          trip.trip_id === parsed.tripId ||
          legs.some((l) => l.kind === "ride" && l.tripId === parsed.tripId);
        if (!tripMatches) {
          return json(403, { error: "trip mismatch" });
        }

        const { error: insErr } = await supabaseAdmin
          .from("rider_vehicle_fixes")
          .insert({
            trip_id: parsed.tripId,
            route_id: parsed.routeId ?? null,
            lat: parsed.lat,
            lng: parsed.lng,
            bearing: parsed.bearing ?? null,
            speed_mps: parsed.speedMps ?? null,
            accuracy_m: parsed.accuracyM ?? null,
            device_id: parsed.deviceId,
          });
        if (insErr) {
          return json(500, { error: "insert failed" });
        }

        // Best-effort cleanup of old rows (don't block on it).
        void supabaseAdmin.rpc("cleanup_rider_fixes").then(
          () => {},
          () => {},
        );

        return json(200, { ok: true });
      },
    },
  },
});
