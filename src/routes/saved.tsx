import { ogImage } from "@/lib/og-url";
import { createFileRoute } from "@tanstack/react-router";
import { RoamSaved } from "@/components/roam/saved/RoamSaved";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved · Aloya" },
      {
        name: "description",
        content: "Pinned places, recent journeys, and offline schedules for your Cyprus rides.",
      },
      { property: "og:title", content: "Saved · Aloya" },
      {
        property: "og:description",
        content: "Pinned places, recent journeys, and offline schedules, kept close.",
      },
      { property: "og:url", content: "https://app.aloya.cy/saved" },
      { property: "og:type", content: "website" },
      { property: "og:image", content: ogImage("/api/public/og/default") },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content:
          "A worn paper map of Cyprus held against a limestone wall, ochre ribbon marking a place.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage("/api/public/og/default") },
    ],
    links: [{ rel: "canonical", href: "https://app.aloya.cy/saved" }],
  }),
  component: RoamSaved,
});
