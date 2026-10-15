import { createFileRoute } from "@tanstack/react-router";
import { incrementCounter, renderPrometheus, setGauge } from "@/lib/metrics";
import { adminGate } from "@/lib/admin-auth.server";

// GET /api/public/metrics
//
// Prometheus scrape endpoint. Companion to /api/public/health: health answers
// "should this instance stay in rotation", metrics answers "what has it been
// doing". Counters are per-isolate and reset when the instance recycles, which
// is the normal contract for a scraped process.
//
// Access (fails closed): the scraper sends `Authorization: Bearer
// <METRICS_TOKEN>`, or an admin calls it (see src/lib/admin-auth.server.ts).
// Everyone else gets a 404.

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await adminGate(request);
        if (denied) return denied;

        // Two always-present series so a fresh instance never returns an empty
        // body — an empty scrape is indistinguishable from a broken exporter.
        incrementCounter(
          "aloya_metrics_scrapes_total",
          {},
          1,
          "Number of times this instance has been scraped.",
        );
        setGauge(
          "aloya_build_info",
          1,
          { runtime: "worker" },
          "Always 1; labels carry build metadata.",
        );

        return new Response(renderPrometheus(), {
          status: 200,
          headers: { "content-type": CONTENT_TYPE, "cache-control": "no-store" },
        });
      },
    },
  },
});
