// Share card for a trip. A GTFS trip id resolves to its line through the
// build-time trip index; a trip that lives only on the rider's phone may carry
// its line as ?r=<routeId>. Without either, the generic live-trip card.
import { createFileRoute } from "@tanstack/react-router";
import { ogAsset, routeForTrip, SAFE_ID } from "@/lib/og-asset";

export const Route = createFileRoute("/api/public/og/trip/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const r = new URL(request.url).searchParams.get("r");
        const routeId =
          r && SAFE_ID.test(r) ? r : params.id ? await routeForTrip(request, params.id) : null;
        const paths = routeId ? [`/og/line/${routeId}.png`, "/og/trip.png"] : ["/og/trip.png"];
        return ogAsset(request, paths, 3600);
      },
    },
  },
});
