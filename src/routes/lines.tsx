import { createFileRoute } from "@tanstack/react-router";
import { RoamLines } from "@/components/roam/lines/RoamLines";

export const Route = createFileRoute("/lines")({
  head: () => ({
    meta: [
      { title: "Lines · Aloya" },
      {
        name: "description",
        content:
          "Every bus line in Cyprus with live status: Nicosia, Limassol, Larnaca, Paphos, Famagusta, Intercity and the Kapnos airport coach.",
      },
      { property: "og:title", content: "Lines · Aloya" },
      { property: "og:url", content: "https://app.aloya.cy/lines" },
    ],
    links: [{ rel: "canonical", href: "https://app.aloya.cy/lines" }],
  }),
  component: RoamLines,
});
