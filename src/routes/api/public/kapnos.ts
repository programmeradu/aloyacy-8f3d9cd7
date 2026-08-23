import { createFileRoute } from "@tanstack/react-router";
import { suggestKapnos } from "@/lib/kapnos.functions";
import { invalidJsonBody, invalidRequest, readJsonBody } from "@/lib/http/validate";
import { KapnosBodySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/kapnos")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return invalidJsonBody(CORS);
        const parsed = KapnosBodySchema.safeParse(payload.value);
        if (!parsed.success) return invalidRequest(parsed.error, CORS);
        try {
          const result = await suggestKapnos({ data: parsed.data });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Kapnos failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
