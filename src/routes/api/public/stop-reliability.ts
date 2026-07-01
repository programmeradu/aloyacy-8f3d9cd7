// Public wrapper around `getStopReliability` + `aggregateStopReliability` so
// the mobile app can render the same "At this stop" card as the web route.
// Body: { stopId: string, routeIds: string[] }. Returns the aggregated row.

import { createFileRoute } from "@tanstack/react-router";
import {
  getStopReliability,
  aggregateStopReliability,
} from "@/lib/reliability.functions";

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
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: CORS,
          });
        }
        try {
          const rows = await getStopReliability({ data: body as never });
          const agg = aggregateStopReliability(rows);
          return new Response(JSON.stringify(agg), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Reliability failed";
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: CORS,
          });
        }
      },
    },
  },
});
