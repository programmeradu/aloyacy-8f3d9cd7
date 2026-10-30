// Share card for a live trip. A trip lives on the rider's phone, so the link
// may carry its line as ?r=<routeId>; with it the card shows that line's real
// path, without it a generic live-trip card.
import { createFileRoute } from "@tanstack/react-router";
import { tripCard } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

export const Route = createFileRoute("/api/public/og/trip/$id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const r = new URL(request.url).searchParams.get("r");
        const routeId = r && /^[A-Za-z0-9_-]{1,32}$/.test(r) ? r : null;
        return pngResponse(tripCard(routeId, await loadShapes()), 600);
      },
    },
  },
});
