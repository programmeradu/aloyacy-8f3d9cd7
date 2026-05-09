// Group planning share endpoint.
//
// POST creates an immutable snapshot of a planned trip (origin, destination,
// planned departure, chosen legs) and returns a short unguessable token that
// anyone can open at /plan/:token to see the plan — no install, no account.
//
// GET fetches a plan by token for the public view. The token IS the
// capability: it is 22 random chars, and the row expires after 7 days.
//
// This is the "party planning" surface distinct from live ETA sharing
// (/eta/:token) or live group watching (/group/:code). It's meant for
// coordinating BEFORE anyone leaves ("meet at Ledra stop, take 30 at 09:15").

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function jsonRes(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

// Random token generator — 22 chars of URL-safe alphabet, ~130 bits of entropy.
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function newToken(): string {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Loose leg schema — mirrors packages/core Itinerary but permissive so we
// don't couple this endpoint to internal changes. Bounded size + primitive
// types only.
const LegSchema = z.record(z.string(), z.union([
  z.string().max(300),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.union([z.string().max(300), z.number().finite(), z.boolean(), z.null()])),
]));

const CY_LAT = z.number().min(34).max(36);
const CY_LNG = z.number().min(32).max(35);

const CreateBody = z.object({
  creatorName: z.string().min(1).max(80).optional(),
  note: z.string().max(280).optional(),
  originLabel: z.string().min(1).max(200),
  originLat: CY_LAT,
  originLng: CY_LNG,
  destinationLabel: z.string().min(1).max(200),
  destinationLat: CY_LAT,
  destinationLng: CY_LNG,
  departureUnix: z.number().int().min(1),
  arrivalUnix: z.number().int().min(1),
  totalDurationSec: z.number().int().min(0).max(24 * 60 * 60),
  transfers: z.number().int().min(0).max(6),
  legs: z.array(LegSchema).min(1).max(12),
});

export const Route = createFileRoute("/api/public/plan-share")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token || token.length < 8 || token.length > 64) {
          return jsonRes(400, { error: "missing_token" });
        }
        const { data, error } = await supabaseAdmin
          .from("trip_plan_shares")
          .select(
            "token, creator_name, note, origin_label, origin_lat, origin_lng, destination_label, destination_lat, destination_lng, departure_unix, arrival_unix, total_duration_sec, transfers, legs, created_at, expires_at",
          )
          .eq("token", token)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (error) return jsonRes(500, { error: "lookup_failed" });
        if (!data) return jsonRes(404, { error: "not_found" });
        return jsonRes(200, data);
      },
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonRes(400, { error: "invalid_json" });
        }
        const parsed = CreateBody.safeParse(body);
        if (!parsed.success) {
          return jsonRes(400, { error: "invalid_body" });
        }
        const p = parsed.data;
        // Sanity: arrival after departure, both within ±14 days.
        const nowSec = Math.floor(Date.now() / 1000);
        const bound = 14 * 24 * 60 * 60;
        if (
          p.arrivalUnix < p.departureUnix ||
          Math.abs(p.departureUnix - nowSec) > bound
        ) {
          return jsonRes(400, { error: "invalid_times" });
        }

        // Try up to 3 times in case of astronomical token collision.
        let token = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const t = newToken();
          const { error } = await supabaseAdmin.from("trip_plan_shares").insert({
            token: t,
            creator_name: p.creatorName ?? null,
            note: p.note ?? null,
            origin_label: p.originLabel,
            origin_lat: p.originLat,
            origin_lng: p.originLng,
            destination_label: p.destinationLabel,
            destination_lat: p.destinationLat,
            destination_lng: p.destinationLng,
            departure_unix: p.departureUnix,
            arrival_unix: p.arrivalUnix,
            total_duration_sec: p.totalDurationSec,
            transfers: p.transfers,
            legs: p.legs,
          });
          if (!error) {
            token = t;
            break;
          }
          // Unique violation → retry with a new token; anything else → fail.
          if (!/duplicate|unique/i.test(error.message)) {
            return jsonRes(500, { error: "insert_failed" });
          }
        }
        if (!token) return jsonRes(500, { error: "token_collision" });

        return jsonRes(200, { token });
      },
    },
  },
});
