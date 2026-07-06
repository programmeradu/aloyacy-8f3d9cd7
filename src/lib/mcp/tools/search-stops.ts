import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const BASE = "https://app.aloya.cy";

type Stop = {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  agency: string;
};

export default defineTool({
  name: "search_stops",
  title: "Search Cyprus bus stops",
  description:
    "Search Aloya's Cyprus-wide bus stop directory (Nicosia, Limassol, Larnaca, Paphos, Intercity) by name or stop code. Returns matching stops with coordinates and agency.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Stop name or code fragment, e.g. 'Eleftheria' or '1234'."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, limit }) => {
    const res = await fetch(`${BASE}/api/public/stops`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { content: [{ type: "text", text: `Stops fetch failed: ${res.status}` }], isError: true };
    }
    const data = (await res.json()) as { stops: Stop[] };
    const q = query.toLowerCase();
    const matches = data.stops
      .filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
      .slice(0, limit ?? 10);
    return {
      content: [{ type: "text", text: JSON.stringify(matches, null, 2) }],
      structuredContent: { matches },
    };
  },
});
