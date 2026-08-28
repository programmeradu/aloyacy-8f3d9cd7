// D5 head for /stop/$stopId. Index only with real content. Fail closed.

import { getStop } from "@/lib/gtfs";
import { stopIndexable, type StopIndexFacts } from "@aloya/core/stop-index";

const BASE = "https://app.aloya.cy";

export function stopHead(stopId: string, facts: StopIndexFacts | undefined) {
  const stop = getStop(stopId);
  const name = stop?.name?.trim() || `Stop ${stopId}`;
  const index = facts ? stopIndexable(facts) : false;
  const title = `${name} — live bus departures | Aloya`;
  const desc = stop
    ? `Live departures, routes and what we actually know about ${name} in Cyprus.`
    : `Live departures for stop ${stopId} in Cyprus.`;
  const url = `${BASE}/stop/${stopId}`;
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
  };
}
