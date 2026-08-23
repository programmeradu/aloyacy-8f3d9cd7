import { createFileRoute } from "@tanstack/react-router";
import { suggestParkAndRide } from "@/lib/park-and-ride.functions";
import { invalidJsonBody, invalidRequest, readJsonBody } from "@/lib/http/validate";
import { ParkAndRideBodySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/park-and-ride")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return invalidJsonBody(CORS);
        const parsed = ParkAndRideBodySchema.safeParse(payload.value);
        if (!parsed.success) return invalidRequest(parsed.error, CORS);
        try {
          const result = await suggestParkAndRide({ data: parsed.data });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Park&Ride failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
