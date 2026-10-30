// Share card for /route/:routeId: the line's real path, its stops and ends,
// drawn at build time. Unknown ids get the default card.
import { createFileRoute } from "@tanstack/react-router";
import { ogAsset, SAFE_ID } from "@/lib/og-asset";

export const Route = createFileRoute("/api/public/og/line/$routeId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.routeId ?? "";
        return ogAsset(request, SAFE_ID.test(id) ? [`/og/line/${id}.png`] : [], 86400);
      },
    },
  },
});
