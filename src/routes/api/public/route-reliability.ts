// Public wrapper around `getRouteReliability` so the mobile app can read the
// same on-time scores the web route hero shows. Body: { routeIds: string[] }.
// No auth: same surface as the web call which runs unauthenticated from the
// route loader. Caps payload at 50 ids to match the underlying validator.

import { createFileRoute } from "@tanstack/react-router";
import { getRouteReliability } from "@/lib/reliability.functions";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { RouteReliabilitySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=60",
};

export const Route = createFileRoute("/api/public/route-reliability")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = RouteReliabilitySchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          const result = await getRouteReliability({ data: parsed.data });
          return jsonResponse(200, result, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Reliability failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
