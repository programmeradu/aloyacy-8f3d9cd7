// Default Roam share card (home and generic pages): the real network around
// Solomos Square with live counts of lines and stops from the static GTFS.
import { createFileRoute } from "@tanstack/react-router";
import { defaultCard } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

export const Route = createFileRoute("/api/public/og/default")({
  server: {
    handlers: {
      GET: async () => pngResponse(defaultCard(await loadShapes()), 3600),
    },
  },
});
