// Public wrapper around `getStopReliability` + `aggregateStopReliability` so
// the mobile app can render the same "At this stop" card as the web route.
// Body: { stopId: string, routeIds: string[] }. Returns the aggregated row.

import { createFileRoute } from "@tanstack/react-router";
import { getStopReliability, aggregateStopReliability } from "@/lib/reliability.functions";
import { jsonResponse, parseJsonBody, readJsonBody, readQuery, readJsonInput, zodDetails, invalidRequest, badRequest } from "@/lib/http/validate";
import { StopReliabilitySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=60",
};

export const Route = createFileRoute("/api/public/stop-reliability")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const __body = await readJsonBody(request, CORS);
          if (!__body.ok) return __body.response;
          const parsed = StopReliabilitySchema.safeParse(__body.value);
          if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);

        try {
          const rows = await getStopReliability({ data: parsed.data });
          const agg = aggregateStopReliability(rows);
          return jsonResponse(200, agg, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Reliability failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
