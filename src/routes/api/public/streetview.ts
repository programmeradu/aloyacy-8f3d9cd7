// Proxy Google Street View Static images through the connector gateway.
// Usage: <img src="/api/public/streetview?lat=35.17&lng=33.36&heading=90" />
import { createFileRoute } from "@tanstack/react-router";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export const Route = createFileRoute("/api/public/streetview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = parseFloat(url.searchParams.get("lat") ?? "");
        const lng = parseFloat(url.searchParams.get("lng") ?? "");
        if (!isFinite(lat) || !isFinite(lng))
          return new Response("bad coords", { status: 400 });
        const heading = url.searchParams.get("heading") ?? "0";
        const size = url.searchParams.get("size") ?? "400x240";
        const fov = url.searchParams.get("fov") ?? "80";
        const pitch = url.searchParams.get("pitch") ?? "0";

        const lk = process.env.LOVABLE_API_KEY;
        const gk = process.env.GOOGLE_MAPS_API_KEY;
        if (!lk || !gk)
          return new Response("missing maps credentials", { status: 500 });

        const upstream = `${GATEWAY}/maps/api/streetview?size=${encodeURIComponent(
          size,
        )}&location=${lat},${lng}&heading=${heading}&fov=${fov}&pitch=${pitch}&source=outdoor&return_error_code=true`;
        const res = await fetch(upstream, {
          headers: {
            Authorization: `Bearer ${lk}`,
            "X-Connection-Api-Key": gk,
          },
        });
        if (!res.ok) {
          return new Response(`street view ${res.status}`, { status: res.status });
        }
        const buf = await res.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=604800, immutable",
          },
        });
      },
    },
  },
});
