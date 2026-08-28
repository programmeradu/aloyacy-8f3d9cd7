import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listIndexableStopIds } from "@/lib/stop-index.server";

const BASE_URL = "https://app.aloya.cy";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Public, indexable landing/content routes. Personalized app screens stay
// out. Stop pages join only when D5 says they have real content.
const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/airport/lca", changefreq: "daily", priority: "0.9" },
  { path: "/airport/pfo", changefreq: "daily", priority: "0.9" },
  { path: "/green-line", changefreq: "monthly", priority: "0.7" },
  { path: "/pulse", changefreq: "daily", priority: "0.8" },
  { path: "/trips", changefreq: "weekly", priority: "0.6" },
  { path: "/saved", changefreq: "weekly", priority: "0.5" },
  { path: "/wallet", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const stops = await listIndexableStopIds().catch(() => [] as string[]);
        const all: SitemapEntry[] = [
          ...entries,
          ...stops.map((id) => ({ path: `/stop/${id}`, changefreq: "daily" as const, priority: "0.6" })),
        ];
        const urls = all.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
