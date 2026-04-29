// CORS-enabled proxy for the static GTFS headsigns index so the mobile app
// (Expo web at localhost) can fetch it without CORS errors. The underlying
// file lives at /gtfs-headsigns.json (served from public/).
import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=3600",
};

export const Route = createFileRoute("/api/public/gtfs-headsigns")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        try {
          const upstream = await fetch(`${origin}/gtfs-headsigns.json`, {
            headers: { Accept: "application/json" },
          });
          if (!upstream.ok) {
            return new Response(JSON.stringify({}), { status: 200, headers: CORS });
          }
          const body = await upstream.text();
          return new Response(body, { status: 200, headers: CORS });
        } catch {
          return new Response(JSON.stringify({}), { status: 200, headers: CORS });
        }
      },
    },
  },
});
