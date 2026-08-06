import { describe, it, expect } from "vitest";
import mcp from "./index";

// Narrow helpers: MCP content blocks are a union, and inputSchema/content are
// optional on the SDK types even though these tools always populate them.

describe("mcp definition", () => {
  it("declares server metadata", () => {
    expect(mcp.name).toBe("aloya-mcp");
    expect(mcp.title).toBe("Aloya — Cyprus Transit");
    expect(mcp.version).toBe("0.2.0");
    expect(typeof mcp.instructions).toBe("string");
    expect(mcp.instructions).toContain("search_stops");
    expect(mcp.instructions).toContain("watch_stop_arrivals");
  });

  it("registers exactly the four expected tools", () => {
    expect(mcp.tools).toHaveLength(4);
    const names = mcp.tools.map((t) => t.name);
    expect(names).toEqual([
      "search_stops",
      "get_stop_arrivals",
      "plan_trip",
      "watch_stop_arrivals",
    ]);
  });

  it("gives every tool a readOnlyHint and openWorldHint annotation", () => {
    for (const t of mcp.tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.openWorldHint).toBe(true);
    }
  });
});
