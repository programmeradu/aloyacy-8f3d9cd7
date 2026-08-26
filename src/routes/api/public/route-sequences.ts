// Stop sequences per route direction, served to the mobile app.
//
// The web bundle imports src/data/route_sequences.json directly; the native
// app can't, so it reads it here. This is what powers the on-board stop
// countdown ("3 stops to go"), which is why it is worth a dedicated,
// long-cached endpoint rather than being folded into /api/public/stops —
// riders only need it once per session, and only while a trip is running.

import { createFileRoute } from "@tanstack/react-router";
import ROUTE_SEQUENCES from "@/data/route_sequences.json";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=86400",
};

export const Route = createFileRoute("/api/public/route-sequences")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        new Response(JSON.stringify(ROUTE_SEQUENCES), { status: 200, headers: CORS }),
    },
  },
});
