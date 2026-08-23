import { createFileRoute } from "@tanstack/react-router";

// Standard top-level /healthz endpoint for container orchestrators and health checks
export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({
            status: "ok",
            time: new Date().toISOString(),
            uptimeSec: Math.floor(process.uptime ? process.uptime() : 0),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
