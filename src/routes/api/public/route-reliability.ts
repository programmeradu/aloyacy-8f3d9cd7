// Public wrapper around `getRouteReliability` so the mobile app can read the
// same on-time scores the web route hero shows. Body: { routeIds: string[] }.
// No auth: same surface as the web call which runs unauthenticated from the
// route loader. Caps payload at 50 ids to match the underlying validator.

import { createFileRoute } from "@tanstack/react-router";
import { getRouteReliability } from "@/lib/reliability.functions";

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
          const result = await getRouteReliability({ data: body as never });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
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
