import { createFileRoute } from "@tanstack/react-router";
import { fetchRealtime } from "@/lib/gtfs-rt.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=15",
};

export const Route = createFileRoute("/api/public/realtime")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        try {
          const snap = await fetchRealtime();
          return new Response(JSON.stringify(snap), {
            status: 200,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({
              error: e instanceof Error ? e.message : "upstream error",
            }),
            { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
          );
        }
      },
    },
  },
});
