// Shared bits for the /route/$routeId page: head metadata and the two clock
// formatters its sections use. Index only when the clock is rated.

import { useI18n } from "@/lib/i18n";
import { getRoute } from "@/lib/gtfs";
import { AGENCY_OPERATOR, resolveAgency } from "@aloya/core/home-search";
import { routeIndexable } from "@aloya/core/route-index";

const BASE = "https://app.aloya.cy";

export function buildRouteJsonLd(input: {
  id: string;
  short: string;
  name: string;
  url: string;
  agency?: string;
}): Record<string, unknown>[] {
  if (!input.short || !input.name) return [];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Aloya", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: input.name, item: input.url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BusTrip",
      name: input.short ? `Bus ${input.short}` : input.name,
      busName: input.short || input.id,
      busNumber: input.short || input.id,
      provider: {
        "@type": "Organization",
        name:
          AGENCY_OPERATOR[resolveAgency({ agency: input.agency, id: input.id })] ??
          "Cyprus Public Transport",
      },
    },
  ];
}

export function routeHead(routeId: string, sampleCount?: number) {
  const route = getRoute(routeId);
  const short = route?.short?.trim() || routeId;
  const name = route?.long?.trim() || `Bus ${short}`;
  const index = routeIndexable(sampleCount ?? 0);
  const title = `Bus ${short} — live departures | Aloya`;
  const desc = route
    ? `Live buses and what we actually measured on ${name} in Cyprus.`
    : `Live buses on Cyprus route ${routeId}.`;
  const url = `${BASE}/route/${routeId}`;
  const og = `${BASE}/og/og-route.jpg`;
  const scripts = index
    ? buildRouteJsonLd({ id: routeId, short, name, url, agency: route?.agency }).map((g) => ({
        type: "application/ld+json" as const,
        children: JSON.stringify(g),
      }))
    : [];
  return {
    meta: [
      { title },
      { name: "description", content: desc },
      { name: "robots", content: index ? "index,follow" : "noindex,follow" },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { property: "og:image", content: og },
      { property: "og:image:width", content: "1216" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:image", content: og },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts,
  };
}

export function fmtRouteClock(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "due" / "7 min" / "1 h 05" — localised, relative to the moment it is called. */
export function useMinutesFromNow() {
  const { t } = useI18n();
  return (unix: number) => {
    const m = Math.round((unix - Date.now() / 1000) / 60);
    if (m <= 0) return t("route.due");
    if (m < 60) return t("route.minShort", { m });
    const h = Math.floor(m / 60);
    return t("route.hourMin", { h, m: m % 60 });
  };
}
