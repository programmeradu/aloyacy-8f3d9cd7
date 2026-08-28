// Same next-bus number the rider sees, keyed by agency + published line.

import { createFileRoute } from "@tanstack/react-router";
import { loadBoard } from "@/lib/board.server";
import { badRequest, jsonResponse, queryRecord, zodDetails } from "@/lib/http/validate";
import { BoardQuerySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=15",
};

export const Route = createFileRoute("/api/public/board")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const parsed = BoardQuerySchema.safeParse(queryRecord(new URL(request.url)));
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          const body = await loadBoard(parsed.data.q);
          return jsonResponse(200, body, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "board fetch failed";
          return jsonResponse(200, { fetchedAt: Math.floor(Date.now() / 1000), stale: true, rows: {}, error: msg }, CORS);
        }
      },
    },
  },
});
