import { createFileRoute } from "@tanstack/react-router";
import { SkyHome } from "@/components/home/SkyHome";

export const Route = createFileRoute("/")({
  head: () => {
    const url = "https://app.aloya.cy/";
    const title = "Aloya — Cyprus bus, the way it should feel";
    const description =
      "Plan, track and ride Cyprus buses with a calm, intelligent interface. Live ETAs, nearby stops, smart routing across the island.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: "https://app.aloya.cy/og/og-home.jpg" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        {
          property: "og:image:alt",
          content: "A rider's hand on a Cyprus bus window at golden hour, olive trees beyond.",
        },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: "https://app.aloya.cy/og/og-home.jpg" },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "alternate", hrefLang: "en", href: url },
        { rel: "alternate", hrefLang: "el", href: url },
        { rel: "alternate", hrefLang: "x-default", href: url },
      ],
    };
  },
  component: IndexRoute,
});

function IndexRoute() {
  return <SkyHome />;
}
