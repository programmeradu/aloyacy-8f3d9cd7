import { createFileRoute } from "@tanstack/react-router";
import { getPlace } from "@/lib/maps.functions";
import { jsonResponse, parseJsonBody } from "@/lib/http/validate";
import { PlaceSchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/place")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const parsed = await parseJsonBody(request, PlaceSchema, CORS);
        if (!parsed.ok) return parsed.response;
        try {
          const result = await getPlace({ data: parsed.data });
          return jsonResponse(200, result, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Place lookup failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
