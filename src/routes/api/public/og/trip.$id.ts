// Share card for a trip. A GTFS trip id resolves to its line through the
// shapes index; a trip that lives only on the rider's phone may carry its line
// as ?r=<routeId>. Without either, a generic live-trip card.
import { createFileRoute } from "@tanstack/react-router";
import { tripCard } from "@/lib/og-roam-cards.server";
import { loadShapes, pngResponse } from "@/lib/og-roam.server";

export const Route = createFileRoute("/api/public/og/trip/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const shapes = await loadShapes();
        const r = new URL(request.url).searchParams.get("r");
        let routeId = r && /^[A-Za-z0-9_-]{1,32}$/.test(r) ? r : null;
        if (!routeId && shapes && params.id) {
          for (const [rid, v] of Object.entries(
            shapes as Record<string, { trips?: Record<string, unknown> }>,
          )) {
            if (v.trips && Object.prototype.hasOwnProperty.call(v.trips, params.id)) {
              routeId = rid;
              break;
            }
          }
        }
        return pngResponse(tripCard(routeId, shapes), 600);
      },
    },
  },
});
