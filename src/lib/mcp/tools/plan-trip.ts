import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const BASE = "https://app.aloya.cy";

export default defineTool({
  name: "plan_trip",
  title: "Plan a Cyprus bus trip from natural language",
  description:
    "Parse a natural-language trip request (e.g. 'Nicosia to Larnaca airport tomorrow 8am') into structured origin, destination and time using Aloya's planner. Returns parsed intent suitable for building a deep link to the app.",
  inputSchema: {
    query: z.string().trim().min(2).describe("Free-form trip request in English or Greek."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query }) => {
    const res = await fetch(`${BASE}/api/public/parse-trip-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query }),
    });
    const body = await res.text();
    if (!res.ok) {
      return { content: [{ type: "text", text: `Planner failed (${res.status}): ${body}` }], isError: true };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
    return {
      content: [{ type: "text", text: typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2) }],
      structuredContent: typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { raw: body },
    };
  },
});
