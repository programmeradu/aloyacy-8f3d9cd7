// Server-side proxy for street-level imagery. We use Mapillary (free,
// crowdsourced) because the managed Google Maps connector key doesn't
// include the Street View Static API scope. Returns a JPEG that the client
// can drop straight into an <img>. 404 when no nearby coverage exists —
// the caller falls back to a styled mini map.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const GRAPH = "https://graph.mapillary.com";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  heading: z.coerce.number().min(0).max(360).optional(),
  // Search radius in metres. Mapillary defaults are tight; 80m matches the
  // walking-step granularity well.
  radius: z.coerce.number().min(10).max(500).default(80),
  // When "1", return JSON metadata (image id + viewer token) instead of the
  // JPEG bytes — used by the interactive viewer sheet.
  meta: z.enum(["0", "1"]).default("0"),
});

type MapillaryImage = {
  id: string;
  thumb_1024_url?: string;
  compass_angle?: number;
  computed_compass_angle?: number;
  captured_at?: number;
  geometry?: { type: "Point"; coordinates: [number, number] };
};

function angularDelta(a: number, b: number) {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

export const Route = createFileRoute("/api/public/streetview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsed.success) {
          return new Response("Bad request", { status: 400 });
        }
        const { lat, lng, heading, radius, meta } = parsed.data;

        const token = process.env.MAPILLARY_ACCESS_TOKEN;
        if (!token) {
          return new Response("MAPILLARY_ACCESS_TOKEN not configured", {
            status: 503,
          });
        }

        // 1. Find candidate images near the point using a small bbox.
        //    ~1 deg lat ≈ 111km. Convert radius (m) to degrees.
        const dLat = radius / 111_000;
        const dLng = radius / (111_000 * Math.cos((lat * Math.PI) / 180) || 1);
        const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].join(",");
        const fields = [
          "id",
          "thumb_1024_url",
          "compass_angle",
          "computed_compass_angle",
          "captured_at",
          "geometry",
        ].join(",");

        const searchUrl =
          `${GRAPH}/images?bbox=${bbox}&limit=20&fields=${fields}`;
        const search = await fetch(searchUrl, {
          headers: { Authorization: `OAuth ${token}` },
        });
        if (!search.ok) {
          return new Response(
            `Mapillary search failed: ${search.status}`,
            { status: 502 },
          );
        }
        const searchJson = (await search.json()) as { data?: MapillaryImage[] };
        const candidates = (searchJson.data ?? []).filter((i) => i.thumb_1024_url);
        if (candidates.length === 0) {
          return new Response("No imagery", { status: 404 });
        }

        // 2. Rank: prefer images whose compass angle is close to the walking
        //    heading (so the photo points the same way the user is walking)
        //    and that are recent.
        const now = Date.now() / 1000;
        const ranked = candidates
          .map((img) => {
            const angle =
              img.computed_compass_angle ?? img.compass_angle ?? 0;
            const headingScore =
              heading == null ? 0 : angularDelta(angle, heading); // lower is better
            const ageDays = img.captured_at
              ? (now - img.captured_at / 1000) / 86400
              : 365 * 5;
            // Weight: heading match dominates, recency is a tiebreaker.
            const score = headingScore + Math.min(ageDays, 365 * 5) * 0.02;
            return { img, score };
          })
          .sort((a, b) => a.score - b.score);

        const best = ranked[0].img;
        if (!best.thumb_1024_url) {
          return new Response("No imagery", { status: 404 });
        }

        // Meta mode: return image id + the public viewer token so the client
        // can boot mapillary-js without baking the secret into the bundle.
        if (meta === "1") {
          return new Response(
            JSON.stringify({ imageId: best.id, token }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=3600",
              },
            },
          );
        }

        // Default: stream the JPEG back so the browser doesn't need a
        // Mapillary token for thumbnails and we keep one cacheable origin.
        const img = await fetch(best.thumb_1024_url);
        if (!img.ok) {
          return new Response(
            `Mapillary thumbnail fetch failed: ${img.status}`,
            { status: 502 },
          );
        }
        const buf = await img.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Mapillary-Image-Id": best.id,
          },
        });
      },
    },
  },
});
