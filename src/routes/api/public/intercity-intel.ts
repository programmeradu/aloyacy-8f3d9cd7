import { createFileRoute } from "@tanstack/react-router";
import { getIntercityInsights } from "@/lib/intercity-intel.functions";
import { invalidRequest, queryRecord } from "@/lib/http/validate";
import { IntercityIntelQuerySchema } from "@/lib/schemas/public-api";

// CORS-open HTTP wrapper around the shared intercity-insights server fn so
// the Aloya rider mobile app reads the exact same weekly pattern the web
// surfaces under `/route/$routeId`. One source of truth.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  // Patterns shift slowly; allow CDN to hold 5 min, SWR 30 min.
  "Cache-Control": "public, max-age=300, stale-while-revalidate=1800",
};

export const Route = createFileRoute("/api/public/intercity-intel")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = IntercityIntelQuerySchema.safeParse(queryRecord(url));
        if (!parsed.success) return invalidRequest(parsed.error, CORS);
        try {
          const result = await getIntercityInsights({ data: parsed.data });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Intel failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
