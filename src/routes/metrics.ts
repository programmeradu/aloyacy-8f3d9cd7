import { createFileRoute } from "@tanstack/react-router";
import { renderPrometheus } from "@/lib/metrics";

// Standard top-level /metrics endpoint for Prometheus scrapers
export const Route = createFileRoute("/metrics")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(renderPrometheus(), {
          status: 200,
          headers: {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
