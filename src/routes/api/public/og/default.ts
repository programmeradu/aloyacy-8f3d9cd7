// Default Roam share card (home and generic pages), drawn at build time.
import { createFileRoute } from "@tanstack/react-router";
import { ogAsset } from "@/lib/og-asset";

export const Route = createFileRoute("/api/public/og/default")({
  server: {
    handlers: {
      GET: async ({ request }) => ogAsset(request, ["/og/default.png"], 3600),
    },
  },
});
