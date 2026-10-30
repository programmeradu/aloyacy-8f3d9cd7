// Share card for /group/:code. Drawn once at build time as a generic group
// card: rendering per group on request exceeds the Workers free plan CPU
// limit. Member positions are never on a public image either way.
import { createFileRoute } from "@tanstack/react-router";
import { ogAsset } from "@/lib/og-asset";

export const Route = createFileRoute("/api/public/og/group/$code")({
  server: {
    handlers: {
      GET: async ({ request }) => ogAsset(request, ["/og/group.png"], 3600),
    },
  },
});
