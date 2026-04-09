import { createFileRoute } from "@tanstack/react-router";
import { suggestBikeShare } from "@/lib/bikeshare.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  // Nextbike feed refresh is ~10 min; allow a short CDN window.
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/bike-share")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
            status: 400,
            headers: CORS,
          });
        }
        try {
          const result = await suggestBikeShare({ data: body as never });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Bike suggestion failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
