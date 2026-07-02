// Server-side proxy for street-level imagery. We use Mapillary (free,
// crowdsourced) because the managed Google Maps connector key doesn't
// include the Street View Static API scope. Returns a JPEG that the client
// can drop straight into an <img>. The search intentionally expands around
// each walking step because turn-by-turn points often sit a few metres away
// from the nearest captured street-level image.

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
  w: z.coerce.number().min(240).max(1600).default(640),
  h: z.coerce.number().min(180).max(1200).default(360),
  fov: z.coerce.number().min(40).max(120).default(85),
  // When "1", return JSON metadata (image id only) — the client uses it to
  // request the JPEG separately. The Mapillary access token is server-only
  // and never returned to clients.
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

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const r = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function imagePoint(img: MapillaryImage) {
  const coords = img.geometry?.coordinates;
  return coords ? { lng: coords[0], lat: coords[1] } : null;
}

function searchUrlForRadius(args: {
  lat: number;
  lng: number;
  radius: number;
  fields: string;
}) {
  const dLat = args.radius / 111_000;
  const dLng =
    args.radius /
    (111_000 * Math.max(0.2, Math.abs(Math.cos((args.lat * Math.PI) / 180))));
  const bbox = [
    args.lng - dLng,
    args.lat - dLat,
    args.lng + dLng,
    args.lat + dLat,
  ].join(",");
  return `${GRAPH}/images?bbox=${bbox}&limit=50&fields=${args.fields}`;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export const Route = createFileRoute("/api/public/streetview")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(
          Object.fromEntries(url.searchParams.entries()),
        );
        if (!parsed.success) {
          return new Response("Bad request", { status: 400, headers: CORS });
        }
        const { lat, lng, heading, radius, meta } = parsed.data;


        const token = process.env.MAPILLARY_ACCESS_TOKEN;
        if (!token) {
          return new Response("MAPILLARY_ACCESS_TOKEN not configured", {
            status: 503,
            headers: CORS,
          });
        }

        const fields = [
          "id",
          "thumb_1024_url",
          "compass_angle",
          "computed_compass_angle",
          "captured_at",
          "geometry",
        ].join(",");

        // 1. Find candidate images near the point. The first pass uses the
        // requested walking-step radius, then expands up to 500m. This avoids
        // false 404s when the route point is on the pavement but imagery is
        // indexed from the carriageway or the opposite side of the junction.
        const seen = new Set<string>();
        const candidates: MapillaryImage[] = [];
        const radii = Array.from(
          new Set([radius, 120, 200, 350, 500].filter((r) => r >= radius)),
        );
        for (const searchRadius of radii) {
          const search = await fetch(
            searchUrlForRadius({ lat, lng, radius: searchRadius, fields }),
            { headers: { Authorization: `OAuth ${token}` } },
          );
          if (!search.ok) {
            return new Response(`Mapillary search failed: ${search.status}`, {
              status: 502,
              headers: CORS,
            });
          }

          const searchJson = (await search.json()) as { data?: MapillaryImage[] };
          for (const img of searchJson.data ?? []) {
            if (!img.thumb_1024_url || seen.has(img.id)) continue;
            seen.add(img.id);
            candidates.push(img);
          }
          if (candidates.length >= 8) break;
        }

        if (candidates.length === 0) {
          return new Response("No imagery", { status: 404, headers: CORS });
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
            const point = imagePoint(img);
            const distanceScore = point ? distanceMeters({ lat, lng }, point) : 500;
            const ageDays = img.captured_at
              ? (now - img.captured_at / 1000) / 86400
              : 365 * 5;
            // Weight: proximity first, then heading, with recency as a light
            // tiebreaker. A nearby side-facing image is better guidance than
            // a perfectly headed image several blocks away.
            const score =
              distanceScore * 0.75 +
              headingScore * 1.8 +
              Math.min(Math.max(ageDays, 0), 365 * 5) * 0.02;
            return { img, score };
          })
          .sort((a, b) => a.score - b.score);

        const best = ranked[0].img;
        if (!best.thumb_1024_url) {
          return new Response("No imagery", { status: 404, headers: CORS });
        }

        // Meta mode: return only the image id. The JPEG is fetched via the
        // default mode of this same endpoint so the access token never
        // leaves the server.
        if (meta === "1") {
          return new Response(
            JSON.stringify({ imageId: best.id }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=3600",
                ...CORS,
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
            { status: 502, headers: CORS },
          );
        }
        const buf = await img.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Mapillary-Image-Id": best.id,
            ...CORS,
          },
        });
      },
    },
  },
});
