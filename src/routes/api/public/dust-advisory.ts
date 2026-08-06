import { createFileRoute } from "@tanstack/react-router";
import { getDustAdvisory } from "@/lib/pulse-live.functions";
import { parseQueryInput } from "@/lib/http/validate";
import { DustAdvisoryQuerySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/dust-advisory")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = parseQueryInput(url, DustAdvisoryQuerySchema, CORS);
        if (!parsed.ok) return parsed.response;
        try {
          const result = await getDustAdvisory({ data: parsed.data });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Dust advisory failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
