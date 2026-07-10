// Public CORS wrapper around `getCurrentWeather` so the mobile app can
// render the same live conditions as the web home header.

import { createFileRoute } from "@tanstack/react-router";
import { getCurrentWeather } from "@/lib/weather.functions";
import { jsonResponse, parseQuery } from "@/lib/http/validate";
import { WeatherQuerySchema } from "@/lib/schemas/public-api";

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
        const parsed = parseQuery(new URL(request.url), WeatherQuerySchema, CORS);
        if (!parsed.ok) return parsed.response;
        try {
          const data = await getCurrentWeather({ data: parsed.data });
          return jsonResponse(200, data, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "weather fetch failed";
          return jsonResponse(500, { error: msg }, CORS);
        }
      },
    },
  },
});
