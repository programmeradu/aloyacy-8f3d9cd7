import { createFileRoute } from "@tanstack/react-router";
import { suggestBoltScooter } from "@/lib/bolt-scooter.functions";
import { invalidJsonBody, invalidRequest, readJsonBody } from "@/lib/http/validate";
import { BoltScooterBodySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/bolt-scooter")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const payload = await readJsonBody(request);
        if (!payload.ok) return invalidJsonBody(CORS);
        const parsed = BoltScooterBodySchema.safeParse(payload.value);
        if (!parsed.success) return invalidRequest(parsed.error, CORS);
        try {
          const result = await suggestBoltScooter({ data: parsed.data });
          return new Response(JSON.stringify(result), { status: 200, headers: CORS });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Scooter suggestion failed";
          return new Response(JSON.stringify({ error: msg }), { status: 400, headers: CORS });
        }
      },
    },
  },
});
