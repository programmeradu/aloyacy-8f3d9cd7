import { createFileRoute } from "@tanstack/react-router";
import { suggestLastMileChain } from "@/lib/last-mile-chain.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

// Mobile wrapper for last-mile taxi/Bolt chain. Same logic as web.
export const Route = createFileRoute("/api/public/last-mile-chain")({
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
          const result = await suggestLastMileChain({ data: body as never });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Chain failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
