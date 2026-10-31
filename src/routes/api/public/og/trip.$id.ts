// Share card for /trip/:id and /trip-info/:id. A GTFS trip id resolves
// through the build-time trip index to its line, first departure and end
// stops; a trip that lives only on the rider's phone may carry ?r=<routeId>.
// Drawn on the Worker, cached a day.
import { createFileRoute } from "@tanstack/react-router";
import { SAFE_ID, tripInfo } from "@/lib/og-asset";
import { ogRender } from "@/lib/og-runtime.server";
import { tripCard } from "@/lib/og-roam-cards.server";

export const Route = createFileRoute("/api/public/og/trip/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id ?? "";
        const r = new URL(request.url).searchParams.get("r");
        const info = SAFE_ID.test(id) ? await tripInfo(request, id) : null;
        const routeId = r && SAFE_ID.test(r) ? r : (info?.routeId ?? null);
        const key = info ? `trip/${id}` : routeId ? `trip/r/${routeId}` : "page/trip";
        return ogRender(
          request,
          key,
          86400,
          (s) =>
            tripCard(routeId, s, info ? { depart: info.depart, from: info.from, to: info.to } : undefined),
          ["/og/trip.png"],
        );
      },
    },
  },
});
