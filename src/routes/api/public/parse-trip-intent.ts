// CORS-open HTTP wrapper around the shared NL trip-intent parser so the
// Aloya mobile app can hand off "Ask Aloya" queries into the same planner
// pipeline the web uses. One parser, one product.
import { createFileRoute } from "@tanstack/react-router";
import { parseTripIntent } from "@/lib/ai-planner.functions";
import { jsonResponse, parseJsonBody } from "@/lib/http/validate";
import { TripIntentSchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/parse-trip-intent")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = await parseJsonBody(request, TripIntentSchema, CORS);
        if (!parsed.ok) return parsed.response;
        try {
          const result = await parseTripIntent({ data: parsed.data });
          return jsonResponse(200, result, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Parse failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
