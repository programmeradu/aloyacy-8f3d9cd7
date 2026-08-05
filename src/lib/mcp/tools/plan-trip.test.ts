import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import tool from "./plan-trip";

// Narrow helpers: MCP content blocks are a union, and inputSchema/content are
// optional on the SDK types even though these tools always populate them.
const textAt = (r: { content?: unknown }, i = 0): string =>
  (r.content as Array<{ text?: string }> | undefined)?.[i]?.text ?? "";
const blocks = (r: { content?: unknown }): Array<{ text?: string }> =>
  (r.content as Array<{ text?: string }> | undefined) ?? [];


describe("plan_trip tool", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has expected metadata", () => {
    expect(tool.name).toBe("plan_trip");
  });

  it("rejects queries shorter than 2 chars", () => {
    expect(() => tool.inputSchema!.query.parse("a")).toThrow();
    expect(tool.inputSchema!.query.parse("ab")).toBe("ab");
  });

  it("posts the query and returns parsed JSON body", async () => {
    const parsed = { origin: "Nicosia", destination: "Larnaca", when: "tomorrow 8am" };
    fetchMock.mockResolvedValue({ ok: true, text: async () => JSON.stringify(parsed) });
    const result = await tool.handler({ query: "Nicosia to Larnaca tomorrow 8am" }, {} as never);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.aloya.cy/api/public/parse-trip-intent",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: "Nicosia to Larnaca tomorrow 8am" }),
      }),
    );
    expect(result.structuredContent).toEqual(parsed);
    expect(JSON.parse(textAt(result, 0) as string)).toEqual(parsed);
  });

  it("falls back to raw text when body is not valid JSON", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "not json" });
    const result = await tool.handler({ query: "hello" }, {} as never);
    expect(textAt(result, 0)).toBe("not json");
    expect(result.structuredContent).toEqual({ raw: "not json" });
  });

  it("returns isError on non-ok response including body text", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => "bad query" });
    const result = await tool.handler({ query: "??" }, {} as never);
    expect(result.isError).toBe(true);
    expect(textAt(result, 0)).toBe("Planner failed (422): bad query");
    expect(result.structuredContent).toBeUndefined();
  });
});
