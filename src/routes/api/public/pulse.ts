// Public CORS bundle for the mobile Pulse tab. Serves the same payloads the
// web /pulse route composes: today briefing, live road pulse, hourly strip,
// and the pulse-live signals (weather / marine / air / traffic / news /
// events / fixtures / cruises / flights / met warnings). One request, one
// snapshot — mobile parity with the web.

import { createFileRoute } from "@tanstack/react-router";
import { getTodayBriefing } from "@/lib/today.functions";
import { getLivePulse, getPulseHourStrip } from "@/lib/pulse.functions";
import { getPulseLive } from "@/lib/pulse-live.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function num(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const Route = createFileRoute("/api/public/pulse")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lat = num(url.searchParams.get("lat"));
        const lng = num(url.searchParams.get("lng"));
        const destLat = num(url.searchParams.get("destLat"));
        const destLng = num(url.searchParams.get("destLng"));

        try {
          const [today, live, hourly, signals] = await Promise.all([
            getTodayBriefing({ data: { lat, lng, destLat, destLng } }),
            getLivePulse(),
            getPulseHourStrip(),
            getPulseLive({ data: { lat, lng } }),
          ]);
          return new Response(
            JSON.stringify({ today, live, hourly, signals }),
            { status: 200, headers: CORS },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "pulse fetch failed";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: CORS,
          });
        }
      },
    },
  },
});
