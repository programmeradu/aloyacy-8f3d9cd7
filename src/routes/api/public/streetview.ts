// Server-side proxy for Google Street View Static imagery. The browser key
// can't sign these requests (referrer-restricted, no streetview scope), so
// we pipe them through the Lovable connector gateway. Cached aggressively
// since imagery for a given lat/lng/heading is effectively immutable.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  heading: z.coerce.number().min(0).max(360).default(0),
  pitch: z.coerce.number().min(-90).max(90).default(0),
  fov: z.coerce.number().min(10).max(120).default(80),
  w: z.coerce.number().int().min(64).max(640).default(600),
  h: z.coerce.number().int().min(64).max(640).default(360),
});

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
        const { lat, lng, heading, pitch, fov, w, h } = parsed.data;

        const lk = process.env.LOVABLE_API_KEY;
        const gk = process.env.GOOGLE_MAPS_API_KEY;
        if (!lk || !gk) {
          return new Response("Maps connector not configured", { status: 503 });
        }
        const headers = {
          Authorization: `Bearer ${lk}`,
          "X-Connection-Api-Key": gk,
        };

        // 1. Check that imagery exists within ~80m of the requested point.
        const metaUrl =
          `${GATEWAY}/maps/api/streetview/metadata` +
          `?location=${lat},${lng}&radius=80&source=outdoor`;
        const meta = await fetch(metaUrl, { headers });
        if (!meta.ok) {
          return new Response("Upstream metadata error", { status: 502 });
        }
        const metaJson = (await meta.json()) as { status?: string };
        if (metaJson.status !== "OK") {
          // No panorama nearby — let the client fall back to the mini map.
          return new Response("No imagery", { status: 404 });
        }

        // 2. Fetch the actual image.
        const imgUrl =
          `${GATEWAY}/maps/api/streetview` +
          `?size=${w}x${h}&location=${lat},${lng}` +
          `&heading=${heading}&pitch=${pitch}&fov=${fov}` +
          `&radius=80&source=outdoor&return_error_code=true`;
        const img = await fetch(imgUrl, { headers });
        if (!img.ok) {
          return new Response("Upstream image error", { status: 502 });
        }
        const buf = await img.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});
