import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authHeaders, getLastMapsError, walkingDirections } from "@/lib/maps.server";

// CORS-open HTTP wrapper for the shared Google Routes walking-directions
// helper. The mobile companion screen calls this identical endpoint so
// turn-by-turn instructions, polyline, and totals match the web 1:1.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const Body = z.object({
  from: z.object({ lat: z.number(), lng: z.number() }),
  to: z.object({ lat: z.number(), lng: z.number() }),
  locale: z.enum(["en", "el"]).optional(),
});

export const Route = createFileRoute("/api/public/walk-directions")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: CORS,
          });
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.message }), {
            status: 400,
            headers: CORS,
          });
        }
        try {
          const directions = await walkingDirections(
            parsed.data.from,
            parsed.data.to,
            parsed.data.locale ?? "en",
          );
          let sentHeaders: string[] = [];
          try {
            sentHeaders = Object.keys(authHeaders());
          } catch {
            // ignore
          }
          const debug = {
            version: "v2-sent-headers",
            sentHeaders,
            hasLovableKey: !!process.env.LOVABLE_API_KEY,
            hasGoogleKey: !!process.env.GOOGLE_MAPS_API_KEY,
            hasServerKey: !!process.env.GOOGLE_MAPS_SERVER_KEY,
            connectionId: process.env.GOOGLE_MAPS_CONNECTION_ID || "std_01ks89na5gfj8ar9b3vtc8qg92",
            lastError: getLastMapsError(),
          };
          return new Response(JSON.stringify({ directions, debug }), {
            status: 200,
            headers: CORS,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "walking failed";
          return new Response(
            JSON.stringify({
              directions: null,
              error: msg,
              debug: {
                hasLovableKey: !!process.env.LOVABLE_API_KEY,
                hasGoogleKey: !!process.env.GOOGLE_MAPS_API_KEY,
                hasServerKey: !!process.env.GOOGLE_MAPS_SERVER_KEY,
                lastError: getLastMapsError(),
              },
            }),
            {
              status: 200,
              headers: CORS,
            },
          );
        }
      },
    },
  },
});
