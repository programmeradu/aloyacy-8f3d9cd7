// B2B Truth API v1 — `/api/v1/truth/eta`.
// Serves verified ETAs with confidence bands, freshness tiers, vehicle positions,
// and reliability metrics. Every rendered departure logs to `eta_predictions`
// with `surface: 'api'` so the Truth API is audited against arrival_truth.

import { createFileRoute } from "@tanstack/react-router";
import { badRequest, jsonResponse, queryRecord, readJsonBody, zodDetails } from "@/lib/http/validate";
import { TruthEtaQuerySchema } from "@/lib/schemas/truth-api";
import { loadTruthEta } from "@/lib/truth-api.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=10",
};

async function handleEtaRequest(request: Request) {
  let rawInput: unknown;

  if (request.method === "GET") {
    rawInput = queryRecord(new URL(request.url));
  } else if (request.method === "POST") {
    const bodyRes = await readJsonBody(request);
    if (!bodyRes.ok) {
      return badRequest("Malformed JSON body", [], CORS);
    }
    rawInput = bodyRes.value;
  } else {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  const parsed = TruthEtaQuerySchema.safeParse(rawInput);
  if (!parsed.success) {
    return badRequest("Invalid query parameters", zodDetails(parsed.error), CORS);
  }

  try {
    const data = await loadTruthEta(parsed.data);
    return jsonResponse(200, data, CORS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Truth API query failed";
    if (msg.includes("not found")) {
      return jsonResponse(404, { ok: false, error: msg }, CORS);
    }
    return jsonResponse(500, { ok: false, error: msg }, CORS);
  }
}

export const Route = createFileRoute("/api/v1/truth/eta")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handleEtaRequest(request),
      POST: async ({ request }) => handleEtaRequest(request),
    },
  },
});
