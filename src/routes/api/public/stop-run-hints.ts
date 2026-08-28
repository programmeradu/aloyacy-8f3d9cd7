// Public wrapper so mobile can render the same no-show line as the stop card.

import { createFileRoute } from "@tanstack/react-router";
import { loadNoShowSlots } from "@/lib/no-show.functions";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { StopRunHintsSchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=60",
};

export const Route = createFileRoute("/api/public/stop-run-hints")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = StopRunHintsSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          const slots = await loadNoShowSlots(parsed.data.routeIds);
          return jsonResponse(200, { slots }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "No-show lookup failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
