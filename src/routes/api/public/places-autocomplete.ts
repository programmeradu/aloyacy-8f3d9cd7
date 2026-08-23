import { createFileRoute } from "@tanstack/react-router";
import { autocompletePlaces } from "@/lib/maps.functions";
import { invalidJsonBody, invalidRequest, readJsonBody } from "@/lib/http/validate";
import { PlacesAutocompleteSchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/places-autocomplete")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return invalidJsonBody(CORS);
        const parsed = PlacesAutocompleteSchema.safeParse(payload.value);
        if (!parsed.success) return invalidRequest(parsed.error, CORS);
        try {
          const result = await autocompletePlaces({ data: parsed.data });
          return Response.json(result, { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Autocomplete failed";
          return Response.json({ error: msg }, { status: 400, headers: CORS });
        }
      },
    },
  },
});
