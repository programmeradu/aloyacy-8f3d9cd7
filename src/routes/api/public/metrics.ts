import { createFileRoute } from "@tanstack/react-router";
import { incrementCounter, renderPrometheus, setGauge } from "@/lib/metrics";

// GET /api/public/metrics
//
// Prometheus scrape endpoint. Companion to /api/public/health: health answers
// "should this instance stay in rotation", metrics answers "what has it been
// doing". Counters are per-isolate and reset when the instance recycles, which
// is the normal contract for a scraped process.
//
// Access: when METRICS_TOKEN is set the scraper must send
// `Authorization: Bearer <token>`; without the variable the endpoint is open,
// which is fine because it exposes only counter names and numbers — never
// request bodies, user identifiers or credentials.

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

function unauthorized(): Response {
  return new Response("unauthorized\n", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const expected = process.env["METRICS_TOKEN"];
        if (expected) {
          const header = request.headers.get("authorization") ?? "";
          if (header !== `Bearer ${expected}`) return unauthorized();
        }

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
