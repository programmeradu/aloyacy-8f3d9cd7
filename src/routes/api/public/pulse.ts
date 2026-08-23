// Public CORS bundle for the mobile Pulse tab. Serves the same payloads the
// web /pulse route composes: today briefing, live road pulse, hourly strip,
// and the pulse-live signals (weather / marine / air / traffic / news /
// events / fixtures / cruises / flights / met warnings). One request, one
// snapshot — mobile parity with the web.

import { createFileRoute } from "@tanstack/react-router";
import { getTodayBriefing } from "@/lib/today.functions";
import { getLivePulse, getPulseHourStrip } from "@/lib/pulse.functions";
import { getPulseLive } from "@/lib/pulse-live.functions";
import { badRequest, jsonResponse, queryRecord, zodDetails } from "@/lib/http/validate";
import { PulseQuerySchema } from "@/lib/schemas/public-api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/public/pulse")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const parsed = PulseQuerySchema.safeParse(queryRecord(new URL(request.url)));
        if (!parsed.success) return badRequest("Invalid request", zodDetails(parsed.error), CORS);
        const { lat, lng, destLat, destLng } = parsed.data;

        try {
          const [today, live, hourly, signals] = await Promise.all([
            getTodayBriefing({ data: { lat, lng, destLat, destLng } }),
            getLivePulse(),
            getPulseHourStrip(),
            getPulseLive({ data: { lat, lng } }),
          ]);
          return jsonResponse(200, { today, live, hourly, signals }, CORS);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "pulse fetch failed";
          return jsonResponse(500, { error: msg }, CORS);
        }
      },
    },
  },
});
