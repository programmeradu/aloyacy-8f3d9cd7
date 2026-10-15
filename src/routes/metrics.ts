import { createFileRoute } from "@tanstack/react-router";
import { renderPrometheus } from "@/lib/metrics";
import { adminGate } from "@/lib/admin-auth.server";

// Standard top-level /metrics endpoint for Prometheus scrapers
export const Route = createFileRoute("/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Ops surface: admin or Bearer METRICS_TOKEN only, 404 otherwise.
        const denied = await adminGate(request);
        if (denied) return denied;
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
