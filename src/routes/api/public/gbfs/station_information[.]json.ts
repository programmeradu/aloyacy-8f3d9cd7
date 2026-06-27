// GBFS station_information — static-ish Nextbike station metadata.
// Source: nextbike-live.json (cached 60s by loadStations()).

import { createFileRoute } from "@tanstack/react-router";
import { loadStations } from "@/lib/bikeshare.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300",
} as const;

export const Route = createFileRoute("/api/public/gbfs/station_information.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const stations = await loadStations();
        const body = {
          last_updated: Math.floor(Date.now() / 1000),
          ttl: 300,
          version: "2.3",
          data: {
            stations: stations.map((s) => ({
              station_id: `nextbike_${s.uid}`,
              name: s.name,
              short_name: String(s.number),
              lat: s.lat,
              lon: s.lng,
              capacity: s.bikes + s.freeRacks,
              region_id: `nextbike_${s.cityId}`,
              rental_methods: ["key", "creditcard"],
              vehicle_type_capacity: { nextbike_ebike: s.bikes + s.freeRacks },
            })),
          },
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
