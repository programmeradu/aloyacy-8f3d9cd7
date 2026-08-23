// Anon-safe HTTP surface for live group trips — mobile calls this since
// it can't import server functions directly. Dispatches by `action` to
// keep one endpoint (create / join / ping / leave / end).
//
// The envelope is validated here; each server function applies its own
// payload schema, so a malformed payload fails as a 400 rather than a 500.

import { createFileRoute } from "@tanstack/react-router";
import {
  createTripGroup,
  endTripGroup,
  joinTripGroup,
  leaveTripGroup,
  pingGroupMember,
} from "@/lib/trip-groups.functions";
import { badRequest, jsonResponse, malformedJsonBody, readJsonBody, zodDetails } from "@/lib/http/validate";
import { TripGroupsEnvelopeSchema, type TripGroupAction } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const HANDLERS: Record<TripGroupAction, (payload: unknown) => Promise<unknown>> = {
  create: (payload) => createTripGroup({ data: payload as never }),
  join: (payload) => joinTripGroup({ data: payload as never }),
  ping: (payload) => pingGroupMember({ data: payload as never }),
  leave: (payload) => leaveTripGroup({ data: payload as never }),
  end: (payload) => endTripGroup({ data: payload as never }),
};

export const Route = createFileRoute("/api/public/trip-groups")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = TripGroupsEnvelopeSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        const { action, payload } = parsed.data;
        try {
          const result = await HANDLERS[action](payload ?? {});
          return jsonResponse(200, result, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "trip-groups failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
