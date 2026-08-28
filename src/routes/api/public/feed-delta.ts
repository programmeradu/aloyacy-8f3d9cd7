// C2 — feed vs rider. Same number the stop page shows.

import { createFileRoute } from "@tanstack/react-router";
import { loadFeedDeltaHints } from "@/lib/feed-delta.server";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { FeedDeltaSchema } from "@/lib/schemas/feed-delta";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "private, max-age=60",
};

export const Route = createFileRoute("/api/public/feed-delta")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = FeedDeltaSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          const hints = await loadFeedDeltaHints(parsed.data.stopId);
          return jsonResponse(200, { hints }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Feed delta failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
