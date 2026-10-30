// Share card for /stop/:stopId: the stop on the real network, the lines that
// serve it. An unknown id falls back to the default card (never an error).
import { createFileRoute } from "@tanstack/react-router";
import { stopCard } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

export const Route = createFileRoute("/api/public/og/stop/$stopId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = /^[A-Za-z0-9_-]{1,32}$/.test(params.stopId ?? "") ? params.stopId : null;
        return pngResponse(stopCard(id, await loadShapes()), 3600);
      },
    },
  },
});
