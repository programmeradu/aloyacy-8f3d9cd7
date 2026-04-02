// GBFS station_status — live Nextbike inventory per station (bikes available,
// docks free). Refreshes ≤ 60s upstream; ttl honest at 60s.

import { createFileRoute } from "@tanstack/react-router";
import { loadStations } from "@/lib/bikeshare.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=30",
} as const;

export const Route = createFileRoute("/api/public/gbfs/station_status.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const stations = await loadStations();
        const now = Math.floor(Date.now() / 1000);
        const body = {
          last_updated: now,
          ttl: 60,
          version: "2.3",
          data: {
            stations: stations.map((s) => ({
              station_id: `nextbike_${s.uid}`,
              num_bikes_available: s.bikes,
              num_docks_available: s.freeRacks,
              is_installed: true,
              is_renting: s.bikes > 0,
              is_returning: s.freeRacks > 0,
              last_reported: now,
              vehicle_types_available: [
                { vehicle_type_id: "nextbike_ebike", count: s.bikes },
              ],
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
