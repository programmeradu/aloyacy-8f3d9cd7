// D2 — rider "it drove past me". Same tally the stop page shows.

import { createFileRoute } from "@tanstack/react-router";
import { loadSkipReport, reportSkip } from "@/lib/skip-report.server";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { StopSkipReportSchema } from "@/lib/schemas/stop-skip-report";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/stop-skip-report")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = StopSkipReportSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          if (parsed.data.action === "get") {
            const tally = await loadSkipReport(parsed.data.stopId, parsed.data.deviceId);
            return jsonResponse(200, { tally }, CORS);
          }
          const result = await reportSkip(parsed.data);
          if (!result.ok) return jsonResponse(result.status, { error: result.error }, CORS);
          return jsonResponse(200, { tally: result.tally }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Skip report failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
