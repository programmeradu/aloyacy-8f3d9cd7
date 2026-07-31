// Shared bits for the /route/$routeId page: head metadata and the two clock
// formatters its sections use.

import { useI18n } from "@/lib/i18n";

const BASE = "https://app.aloya.cy";

export function routeHead(routeId: string) {
  const title = `Route ${routeId} — Aloya`;
  const desc = `Live buses, next departure and every stop on Cyprus bus route ${routeId}.`;
  const url = `${BASE}/route/${routeId}`;
  const og = `${BASE}/og/og-route.jpg`;
  return {
    meta: [
      { title },
      { name: "description", content: desc },
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
