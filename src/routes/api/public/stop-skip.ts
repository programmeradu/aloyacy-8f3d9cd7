// D2 — skip rate. Same number the stop page shows.

import { createFileRoute } from "@tanstack/react-router";
import { loadSkipRates } from "@/lib/skip-rate.server";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { StopSkipSchema } from "@/lib/schemas/stop-skip";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=60",
};

export const Route = createFileRoute("/api/public/stop-skip")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = StopSkipSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          const rates = await loadSkipRates(parsed.data.stopId);
          return jsonResponse(200, { rates }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Skip rate failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
