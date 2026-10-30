// Share card for /route/:routeId: the line's real path, its stops and ends.
import { createFileRoute } from "@tanstack/react-router";
import { lineCard } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

export const Route = createFileRoute("/api/public/og/line/$routeId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = /^[A-Za-z0-9_-]{1,32}$/.test(params.routeId ?? "") ? params.routeId : null;
        return pngResponse(lineCard(id, await loadShapes()), 3600);
      },
    },
  },
});
