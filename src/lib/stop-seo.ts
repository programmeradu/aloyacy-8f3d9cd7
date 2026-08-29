// D5 head for /stop/$stopId. Index only with real content. Fail closed.

import { getStop, getRoute } from "@/lib/gtfs";
import { stopIndexable, type StopIndexFacts } from "@aloya/core/stop-index";

const BASE = "https://app.aloya.cy";

export function buildStopJsonLd(input: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  url: string;
  ratedRouteIds?: string[];
}): Record<string, unknown>[] {
  if (!input.name || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return [];
  
  const blocks: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "BusStop",
      name: input.name,
      url: input.url,
      identifier: input.id,
      geo: {
        "@type": "GeoCoordinates",
        latitude: input.lat,
        longitude: input.lng,
      },
      address: { "@type": "PostalAddress", addressCountry: "CY" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Aloya", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: input.name, item: input.url },
      ],
    },
  ];

  if (input.ratedRouteIds) {
    for (const rid of input.ratedRouteIds) {
      const route = getRoute(rid);
      if (!route) continue;
      
      blocks.push({
        "@context": "https://schema.org",
        "@type": "BusTrip",
        name: route.short ? `Bus ${route.short}` : route.long,
        busName: route.short || rid,
        busNumber: route.short || rid,
        provider: {
          "@type": "Organization",
          name: route.agency === "IC" ? "Intercity Buses" : "Cyprus Public Transport",
        },
        departureBusStop: {
          "@type": "BusStop",
          name: input.name,
          identifier: input.id,
        }
      });
    }
  }

  return blocks;
}

export function stopHead(stopId: string, facts: (StopIndexFacts & { ratedRouteIds?: string[] }) | undefined) {
  const stop = getStop(stopId);
  const name = stop?.name?.trim() || `Stop ${stopId}`;
  const index = facts ? stopIndexable(facts) : false;
  const title = `${name} — live bus departures | Aloya`;
  const desc = stop
    ? `Live departures, routes and what we actually know about ${name} in Cyprus.`
    : `Live departures for stop ${stopId} in Cyprus.`;
  const url = `${BASE}/stop/${stopId}`;
  const scripts =
    index && stop
      ? buildStopJsonLd({
          id: stop.id,
          name,
          lat: stop.lat,
          lng: stop.lng,
          url,
          ratedRouteIds: facts?.ratedRouteIds,
        }).map((g) => ({ type: "application/ld+json" as const, children: JSON.stringify(g) }))
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
      { property: "og:image", content: `${BASE}/og/og-stop.jpg` },
      { property: "og:image:width", content: "1216" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:image", content: `${BASE}/og/og-stop.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts,
  };
}
