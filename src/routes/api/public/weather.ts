// Public CORS wrapper around `getCurrentWeather` so the mobile app can
// render the same live conditions as the web home header.

import { createFileRoute } from "@tanstack/react-router";
import { getCurrentWeather } from "@/lib/weather.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=600",
};

export const Route = createFileRoute("/api/public/weather")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = Number(url.searchParams.get("lat"));
        const lng = Number(url.searchParams.get("lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return new Response(JSON.stringify({ error: "lat/lng required" }), {
            status: 400,
            headers: CORS,
          });
        }
        try {
          const data = await getCurrentWeather({ data: { lat, lng } });
          return new Response(JSON.stringify(data), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "weather fetch failed";
          return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS });
        }
      },
    },
  },
});
