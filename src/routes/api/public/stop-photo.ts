// D1 — stop photo. Same image the stop page shows.

import { createFileRoute } from "@tanstack/react-router";
import { loadStopPhoto, uploadStopPhoto } from "@/lib/stop-photo.server";
import {
  badRequest,
  jsonResponse,
  malformedJsonBody,
  readJsonBody,
  zodDetails,
} from "@/lib/http/validate";
import { StopPhotoSchema } from "@/lib/schemas/stop-photo";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/public/stop-photo")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return malformedJsonBody(CORS);
        const parsed = StopPhotoSchema.safeParse(payload.value);
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        try {
          if (parsed.data.action === "get") {
            const photo = await loadStopPhoto(parsed.data.stopId);
            return jsonResponse(200, { photo }, CORS);
          }
          const result = await uploadStopPhoto(parsed.data);
          if (!result.ok) return jsonResponse(result.status, { error: result.error }, CORS);
          return jsonResponse(200, { photo: result.photo }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Stop photo failed";
          return jsonResponse(400, { error: msg }, CORS);
        }
      },
    },
  },
});
