import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const BASE = "https://app.aloya.cy";

type Arrival = { stopId: string; routeId: string; tripId: string; arrivalUnix: number; delaySec: number };

async function fetchArrivals(stopId: string) {
  const res = await fetch(`${BASE}/api/public/realtime`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Realtime ${res.status}`);
  const data = (await res.json()) as { arrivals: Arrival[]; stale?: boolean };
  const now = Math.floor(Date.now() / 1000);
  return {
    now,
    stale: data.stale ?? false,
    arrivals: data.arrivals
      .filter((a) => a.stopId === stopId && a.arrivalUnix >= now - 60)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
      .map((a) => ({ ...a, etaSec: a.arrivalUnix - now })),
  };
}

export default defineTool({
  name: "watch_stop_arrivals",
  title: "Watch a stop for live arrivals (long-poll)",
  description:
    "Long-polls Aloya's real-time feed for a stop and returns as soon as a bus is within `alertWithinSec` seconds, an ETA shifts by more than 60s, or the timeout elapses. Call this instead of repeatedly polling `get_stop_arrivals` — one call effectively streams the next meaningful update. Safe to call in a loop for continuous monitoring.",
  inputSchema: {
    stopId: z.string().trim().min(1).describe("Stop id from search_stops."),
    routeId: z.string().trim().optional().describe("Optional: only watch this route id."),
    alertWithinSec: z.number().int().min(30).max(1800).optional().describe("Trigger when next bus ETA <= this (default 300 = 5 min)."),
    timeoutSec: z.number().int().min(5).max(25).optional().describe("Max seconds to wait before returning current state (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ stopId, routeId, alertWithinSec, timeoutSec }) => {
    const alertAt = alertWithinSec ?? 300;
    const deadline = Date.now() + (timeoutSec ?? 20) * 1000;
    const pollMs = 5000;

    const initial = await fetchArrivals(stopId);
    const filter = (list: Arrival[]) => (routeId ? list.filter((a) => a.routeId === routeId) : list);
    const baseline = new Map(filter(initial.arrivals).map((a) => [a.tripId, a.arrivalUnix]));

    while (true) {
      const snap = await fetchArrivals(stopId);
      const list = filter(snap.arrivals);
      const next = list[0];

      const triggered =
        (next && next.etaSec <= alertAt && !baseline.has(next.tripId)) ||
        (next && Math.abs((baseline.get(next.tripId) ?? next.arrivalUnix) - next.arrivalUnix) > 60) ||
        (next && next.etaSec <= alertAt) ||
        Date.now() >= deadline;

      if (triggered) {
        const validForSec = next ? Math.max(15, Math.min(next.etaSec, 60)) : 30;
        const payload = {
          stopId,
          routeId: routeId ?? null,
          stale: snap.stale,
          triggered: Boolean(next && next.etaSec <= alertAt),
          reason: !next
            ? "no_upcoming"
            : Date.now() >= deadline
              ? "timeout"
              : next.etaSec <= alertAt
                ? "within_window"
                : "eta_shift",
          arrivals: list.slice(0, 5),
          validUntilUnix: snap.now + validForSec,
          hint:
            "Data is a live snapshot. Call watch_stop_arrivals again to get the next update; do not ask the user to reprompt.",
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) continue;
      await new Promise((r) => setTimeout(r, Math.min(pollMs, remaining)));
    }
  },
});
