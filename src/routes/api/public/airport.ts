// Public CORS wrapper around `getAirportPage`. Consumed by the mobile
// `/airport/[code]` screen so it can render the exact same Kapnos coach
// lines + airport metadata the web page does, without importing server
// functions directly into the RN bundle.

import { createFileRoute } from "@tanstack/react-router";
import { getAirportPage } from "@/lib/airport.functions";
import { invalidRequest, queryRecord } from "@/lib/http/validate";
import { AirportQuerySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/airport")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = AirportQuerySchema.safeParse(queryRecord(url));
        if (!parsed.success) return invalidRequest(parsed.error, CORS);
        try {
          const data = await getAirportPage({ data: { code: parsed.data.code } });
          return new Response(JSON.stringify(data), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "airport fetch failed";
          return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS });
        }
      },
    },
  },
});
