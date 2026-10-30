// Share card for /stop/:stopId: the stop on the real network and the lines
// that serve it, drawn at build time. Unknown ids get the default card.
import { createFileRoute } from "@tanstack/react-router";
import { ogAsset, SAFE_ID } from "@/lib/og-asset";

export const Route = createFileRoute("/api/public/og/stop/$stopId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.stopId ?? "";
        return ogAsset(request, SAFE_ID.test(id) ? [`/og/stop/${id}.png`] : [], 86400);
      },
    },
  },
});
