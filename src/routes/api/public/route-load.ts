// Crowd level for a route (optionally one trip) for the mobile ride HUD,
// which used to read `route_load_estimates` through supabase-js. Same logic
// and JSON as the web server function getRouteLoad. Aggregated, public data:
// no session needed.
//
//   GET ?routeId=...&tripId=...  -> { level: "quiet"|"moderate"|"busy"|"packed"|null, riders, sample }

import { createFileRoute } from "@tanstack/react-router";
import { getRouteLoad } from "@/lib/crowd.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

export const Route = createFileRoute("/api/public/route-load")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const routeId = sp.get("routeId") ?? "";
        const tripId = sp.get("tripId") || undefined;
        if (!routeId || routeId.length > 64 || (tripId && tripId.length > 128)) {
          return json(400, { error: "invalid_route" });
        }
        try {
          return json(200, await getRouteLoad({ data: { routeId, tripId } }));
        } catch {
          return json(500, { error: "lookup_failed" });
        }
      },
    },
  },
});
