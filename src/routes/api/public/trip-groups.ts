// Anon-safe HTTP surface for live group trips — mobile calls this since
// it can't import server functions directly. Dispatches by `action` to
// keep one endpoint (create / ping / leave / join).

import { createFileRoute } from "@tanstack/react-router";
import {
  createTripGroup,
  joinTripGroup,
  leaveTripGroup,
  pingGroupMember,
} from "@/lib/trip-groups.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/trip-groups")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: { action?: string; payload?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS });
        }
        const action = body.action;
        const payload = body.payload;
        try {
          let result: unknown;
          switch (action) {
            case "create":
              result = await createTripGroup({ data: payload as never });
              break;
            case "join":
              result = await joinTripGroup({ data: payload as never });
              break;
            case "ping":
              result = await pingGroupMember({ data: payload as never });
              break;
            case "leave":
              result = await leaveTripGroup({ data: payload as never });
              break;
            default:
              return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });
          }
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "trip-groups failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
