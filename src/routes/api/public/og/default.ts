// Share card for home and the app's own pages (?p=lines|pulse|pass|saved|planner|trip|plan|group),
// drawn on the Worker and cached (src/lib/og-runtime.server.ts).
import { createFileRoute } from "@tanstack/react-router";
import { ogRender } from "@/lib/og-runtime.server";
import {
  defaultCard,
  genericGroupCard,
  genericPlanCard,
  networkCard,
  passCard,
  plannerCard,
  pulseCard,
  savedCard,
  tripCard,
} from "@/lib/og-roam-cards.server";
import type { Shapes } from "@/lib/og-roam.server";

const PAGES: Record<string, (s: Shapes | null) => string> = {
  default: defaultCard,
  lines: networkCard,
  pulse: pulseCard,
  pass: passCard,
  saved: savedCard,
  planner: plannerCard,
  trip: (s) => tripCard(null, s),
  plan: genericPlanCard,
  group: genericGroupCard,
};

export const Route = createFileRoute("/api/public/og/default")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams.get("p") ?? "default";
        const p = PAGES[q] ? q : "default";
        return ogRender(request, `page/${p}`, 604800, PAGES[p], [`/og/${p}.png`]);
      },
    },
  },
});
