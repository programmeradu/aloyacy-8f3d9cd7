// GBFS 2.3 auto-discovery for Cyprus micromobility — unified feed covering
// Nextbike (5 cities, docked bikes) and Bolt (Nicosia, e-scooter parking
// zones). Published so MobilityData's catalog, OpenTripPlanner, Transitland,
// and any MaaS planner can pick Cyprus up automatically. This is the
// canonical-data-layer claim: whoever publishes clean micromobility data
// first becomes the source future tools integrate against.
//
// Why 2.3 and not 3.0: tooling parity. OTP, Transitland and the major
// catalog ingestors still default to 2.3.

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
} as const;

export const Route = createFileRoute("/api/public/gbfs.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const base = new URL(request.url).origin;
        const body = {
          last_updated: Math.floor(Date.now() / 1000),
          ttl: 60,
          version: "2.3",
          data: {
            en: {
              feeds: [
                { name: "system_information", url: `${base}/api/public/gbfs/system_information.json` },
                { name: "vehicle_types", url: `${base}/api/public/gbfs/vehicle_types.json` },
                { name: "station_information", url: `${base}/api/public/gbfs/station_information.json` },
                { name: "station_status", url: `${base}/api/public/gbfs/station_status.json` },
                { name: "free_bike_status", url: `${base}/api/public/gbfs/free_bike_status.json` },
              ],
            },
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
