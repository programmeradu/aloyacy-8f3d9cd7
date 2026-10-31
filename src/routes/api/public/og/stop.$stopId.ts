// Share card for /stop/:stopId (and /airport/:code via ?airport=lca|pfo):
// the stop on the island network with every line through it in its feed
// colour. Drawn on the Worker, cached a week.
import { createFileRoute } from "@tanstack/react-router";
import { SAFE_ID } from "@/lib/og-asset";
import { ogRender } from "@/lib/og-runtime.server";
import { airportCard, defaultCard, stopCard } from "@/lib/og-roam-cards.server";

export const Route = createFileRoute("/api/public/og/stop/$stopId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.stopId ?? "";
        const airport = new URL(request.url).searchParams.get("airport");
        if (airport === "lca" || airport === "pfo")
          return ogRender(
            request,
            `airport/${airport}`,
            604800,
            (s) => airportCard(airport, id, s),
            [`/og/airport/${airport}.png`],
          );
        if (!SAFE_ID.test(id)) return ogRender(request, "page/default", 604800, defaultCard, []);
        return ogRender(request, `stop/${id}`, 604800, (s) => stopCard(id, s), []);
      },
    },
  },
});
