// GBFS system_information — identifies the operator(s) and aggregator.
// Aloya publishes as the aggregator; the underlying systems (Nextbike,
// Bolt) are credited so consumers know the upstream source of truth.

import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600",
} as const;

export const Route = createFileRoute("/api/public/gbfs/system_information.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const body = {
          last_updated: Math.floor(Date.now() / 1000),
          ttl: 3600,
          version: "2.3",
          data: {
            system_id: "aloya_cy_micromobility",
            language: "en",
            name: "Cyprus Micromobility (Aloya aggregator)",
            short_name: "Aloya CY",
            operator: "Aloya — aggregating Nextbike Cyprus and Bolt Cyprus",
            url: "https://aloya.cy",
            purchase_url: "https://aloya.cy",
            start_date: "2024-01-01",
            timezone: "Asia/Nicosia",
            email: "hello@aloya.cy",
            attribution_organization_name:
              "Nextbike Cyprus, Bolt Cyprus, CyNAP — aggregated by Aloya",
            attribution_url: "https://app.aloya.cy",
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
