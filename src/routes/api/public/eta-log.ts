// Prediction ledger write path. Surfaces sample what they *rendered* so we
// can later score it against arrival_truth. Hour/dow are stamped here in
// Asia/Nicosia — never trusted from the client.

import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@/lib/db/compat";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cyHourDow } from "@aloya/core/cy-time";
import { EtaLogSchema } from "@/lib/schemas/public-api";

const db = supabaseAdmin as unknown as SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/eta-log")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = EtaLogSchema.parse(await request.json());
        } catch {
          return json(400, { error: "Invalid payload" });
        }
        const { hour, dow } = cyHourDow(Date.now());
        const { error } = await db.from("eta_predictions").insert({
          trip_id: parsed.tripId,
          route_id: parsed.routeId,
          stop_id: parsed.stopId,
          horizon_sec: parsed.horizonSec,
          p50_sec: parsed.p50Sec,
          p25_sec: parsed.p25Sec ?? null,
          p90_sec: parsed.p90Sec ?? null,
          tier: parsed.tier,
          confidence: parsed.confidence,
          operator_eta_sec: parsed.operatorEtaSec ?? null,
          learned_bias_sec: parsed.learnedBiasSec ?? null,
          surface: parsed.surface,
          hour_of_day: hour,
          day_of_week: dow,
        });
        if (error) return json(500, { error: "insert failed" });
        return json(200, { ok: true });
      },
    },
  },
});
