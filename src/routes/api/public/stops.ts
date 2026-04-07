import { createFileRoute } from "@tanstack/react-router";
import stops from "@/data/stops.json";
import routes from "@/data/routes.json";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Stops change slowly (with GTFS ingests). Cache hard at edge so mobile
  // clients don't re-download multi-MB JSON on every cold start.
  "Cache-Control": "public, max-age=3600, s-maxage=86400",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/stops")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        new Response(JSON.stringify({ stops, routes }), {
          status: 200,
          headers: CORS,
        }),
    },
  },
});
