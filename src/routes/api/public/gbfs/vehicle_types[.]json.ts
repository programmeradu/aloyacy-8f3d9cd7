// GBFS vehicle_types — every shared vehicle kind available in the Cyprus
// aggregate. Two kinds for now: Nextbike electric-assist bicycles (docked),
// Bolt electric kick-scooters (free-floating within parking zones).

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600",
} as const;

export const Route = createFileRoute("/api/public/gbfs/vehicle_types.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const body = {
          last_updated: Math.floor(Date.now() / 1000),
          ttl: 3600,
          version: "2.3",
          data: {
            vehicle_types: [
              {
                vehicle_type_id: "nextbike_ebike",
                form_factor: "bicycle",
                propulsion_type: "electric_assist",
                max_range_meters: 40_000,
                name: "Nextbike e-bike",
                return_constraint: "any_station",
              },
              {
                vehicle_type_id: "bolt_escooter",
                form_factor: "scooter_standing",
                propulsion_type: "electric",
                max_range_meters: 30_000,
                name: "Bolt e-scooter",
                return_constraint: "geofence_zone",
              },
            ],
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
