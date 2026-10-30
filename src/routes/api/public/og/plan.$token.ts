// Share card for /plan/:token. Drawn once at build time as a generic shared
// plan card: rendering per plan on request exceeds the Workers free plan CPU
// limit.
import { createFileRoute } from "@tanstack/react-router";
import { ogAsset } from "@/lib/og-asset";

export const Route = createFileRoute("/api/public/og/plan/$token")({
  server: {
    handlers: {
      GET: async ({ request }) => ogAsset(request, ["/og/plan.png"], 3600),
    },
  },
});
