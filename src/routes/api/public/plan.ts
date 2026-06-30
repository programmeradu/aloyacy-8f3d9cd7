import { createFileRoute } from "@tanstack/react-router";
import { planMultiLeg } from "@/lib/multileg.functions";

// CORS-open HTTP wrapper around the shared planner so the Aloya mobile
// rider app (and any other first-party native client) can call the exact
// same planning logic the web uses. Same input, same output — there is
// only one planner in this product.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  // The planner is dynamic (live feed + clock); never let CDNs cache it.
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/plan")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: CORS },
          );
        }
        try {
          // planMultiLeg validates the input with Zod internally and
          // returns a plain DTO — safe to JSON.stringify directly.
          const result = await planMultiLeg({ data: body as never });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: CORS,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Planner failed";
          return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: CORS,
          });
        }
      },
    },
  },
});
