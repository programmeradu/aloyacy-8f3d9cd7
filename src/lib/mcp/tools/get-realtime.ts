import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const BASE = "https://app.aloya.cy";

type Arrival = {
  stopId: string;
  routeId: string;
  tripId: string;
  arrivalUnix: number;
  delaySec: number;
};

export default defineTool({
  name: "get_stop_arrivals",
  title: "Get live arrivals for a stop",
  description:
    "Fetch upcoming live bus arrivals for a specific Cyprus stop from Aloya's real-time feed. Returns route, trip, ETA (unix seconds) and delay.",
  inputSchema: {
    stopId: z.string().trim().min(1).describe("The stop id (as returned by search_stops)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Max arrivals to return (default 8)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async ({ stopId, limit }) => {
    const res = await fetch(`${BASE}/api/public/realtime`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Realtime fetch failed: ${res.status}` }],
        isError: true,
      };
    }
    const data = (await res.json()) as { arrivals: Arrival[]; fetchedAt: number; stale?: boolean };
    const now = Math.floor(Date.now() / 1000);
    const arrivals = data.arrivals
      .filter((a) => a.stopId === stopId && a.arrivalUnix >= now - 60)
      .sort((a, b) => a.arrivalUnix - b.arrivalUnix)
      .slice(0, limit ?? 8)
      .map((a) => ({ ...a, etaSec: a.arrivalUnix - now }));
    return {
      content: [
        {
          type: "text",
          text: arrivals.length
            ? JSON.stringify({ stopId, stale: data.stale ?? false, arrivals }, null, 2)
            : `No upcoming arrivals for stop ${stopId}.`,
        },
      ],
      structuredContent: { stopId, stale: data.stale ?? false, arrivals },
    };
  },
});
