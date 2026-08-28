// D1 — stop condition. Same consensus the stop page shows.

import { createFileRoute } from "@tanstack/react-router";
import { loadStopCondition, reportStopCondition } from "@/lib/stop-condition.server";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { StopConditionSchema } from "@/lib/schemas/stop-condition";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/stop-condition")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = StopConditionSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          if (parsed.data.action === "get") {
            const rows = await loadStopCondition(parsed.data.stopId);
            return jsonResponse(200, { rows }, CORS);
          }
          const result = await reportStopCondition(parsed.data);
          if (!result.ok) return jsonResponse(result.status, { error: result.error }, CORS);
          return jsonResponse(200, { rows: result.rows }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Stop condition failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
