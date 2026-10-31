// Share card for /route/:routeId: the line's real path in its feed colour,
// its stops and ends. Drawn on the Worker, cached a week.
import { createFileRoute } from "@tanstack/react-router";
import { SAFE_ID } from "@/lib/og-asset";
import { ogRender } from "@/lib/og-runtime.server";
import { defaultCard, lineCard } from "@/lib/og-roam-cards.server";

export const Route = createFileRoute("/api/public/og/line/$routeId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.routeId ?? "";
        if (!SAFE_ID.test(id)) return ogRender(request, "page/default", 604800, defaultCard, []);
        return ogRender(request, `line/${id}`, 604800, (s) => lineCard(id, s), ["/og/lines.png"]);
      },
    },
  },
});
