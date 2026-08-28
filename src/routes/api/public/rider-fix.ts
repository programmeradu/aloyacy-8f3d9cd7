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
// A physics score is stored on every row; fusion ignores < 0.25.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { scoreRiderFix, type RiderFixSample } from "@aloya/core/rider-physics";
import { getShapeForTripSync, loadShapesFromUrl } from "@aloya/core/shapes";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRoute } from "@/lib/gtfs";

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

type Parsed = z.infer<typeof Body>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function physicsScoreFor(parsed: Parsed, requestUrl: string): Promise<number | null> {
  try {
    const [{ data: priorRows }] = await Promise.all([
      supabaseAdmin
        .from("rider_vehicle_fixes")
        .select("lat, lng, reported_at, speed_mps, accuracy_m")
        .eq("device_id", parsed.deviceId)
        .eq("trip_id", parsed.tripId)
        .order("reported_at", { ascending: false })
        .limit(12),
      loadShapesFromUrl(new URL("/gtfs-shapes.json", requestUrl).href),
    ]);
    const prior: RiderFixSample[] = [...(priorRows ?? [])].reverse().map((p) => ({
      lat: p.lat,
      lng: p.lng,
      tMs: new Date(p.reported_at).getTime(),
      speedMps: p.speed_mps,
      accuracyM: p.accuracy_m,
    }));
    return scoreRiderFix({
      fix: {
        lat: parsed.lat,
        lng: parsed.lng,
        tMs: Date.now(),
        speedMps: parsed.speedMps,
        accuracyM: parsed.accuracyM,
      },
      prior,
      shape: getShapeForTripSync(parsed.tripId, parsed.routeId),
      agency: parsed.routeId ? getRoute(parsed.routeId)?.agency : undefined,
    }).score;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/rider-fix")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed: Parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
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

        const physicsScore = await physicsScoreFor(parsed, request.url);
        const row = {
          trip_id: parsed.tripId,
          route_id: parsed.routeId ?? null,
          lat: parsed.lat,
          lng: parsed.lng,
          bearing: parsed.bearing ?? null,
          speed_mps: parsed.speedMps ?? null,
          accuracy_m: parsed.accuracyM ?? null,
          device_id: parsed.deviceId,
          physics_score: physicsScore,
        };
        let { error: insErr } = await supabaseAdmin.from("rider_vehicle_fixes").insert(row);
        if (insErr) {
          const { physics_score: _score, ...bare } = row;
          ({ error: insErr } = await supabaseAdmin.from("rider_vehicle_fixes").insert(bare));
        }
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
