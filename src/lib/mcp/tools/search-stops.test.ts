import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import tool from "./search-stops";

describe("search_stops tool", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has expected metadata", () => {
    expect(tool.name).toBe("search_stops");
    expect(tool.annotations).toEqual({
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("rejects empty query via schema", () => {
    expect(() => tool.inputSchema.query.parse("")).toThrow();
  });

  it("accepts a valid query and trims it", () => {
    expect(tool.inputSchema.query.parse("  eleftheria  ")).toBe("eleftheria");
  });

  it("rejects limit outside 1..50", () => {
    expect(() => tool.inputSchema.limit!.parse(0)).toThrow();
    expect(() => tool.inputSchema.limit!.parse(51)).toThrow();
    expect(tool.inputSchema.limit!.parse(25)).toBe(25);
  });

  it("returns matching stops shaped as content + structuredContent", async () => {
    const stops = [
      { id: "1", code: "1234", name: "Eleftheria Square", lat: 1, lng: 1, agency: "OSEL" },
      { id: "2", code: "9999", name: "Other Stop", lat: 2, lng: 2, agency: "OSEL" },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ stops }),
    });
    const result = await tool.handler({ query: "eleftheria" }, {} as never);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.aloya.cy/api/public/stops",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ matches: [stops[0]] });
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text as string)).toEqual([stops[0]]);
  });

  it("matches by code fragment case-insensitively", async () => {
    const stops = [{ id: "1", code: "AB12", name: "Somewhere", lat: 0, lng: 0, agency: "OSEL" }];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stops }) });
    const result = await tool.handler({ query: "ab1" }, {} as never);
    expect(result.structuredContent).toEqual({ matches: stops });
  });

  it("respects the limit parameter", async () => {
    const stops = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      code: `C${i}`,
      name: `Stop ${i}`,
      lat: 0,
      lng: 0,
      agency: "OSEL",
    }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ stops }) });
    const result = await tool.handler({ query: "stop", limit: 2 }, {} as never);
    expect((result.structuredContent as { matches: unknown[] }).matches).toHaveLength(2);
  });

  it("returns empty matches array when nothing matches", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ stops: [{ id: "1", code: "X", name: "Y", lat: 0, lng: 0, agency: "A" }] }),
    });
    const result = await tool.handler({ query: "zzz-no-match" }, {} as never);
    expect(result.structuredContent).toEqual({ matches: [] });
    expect(JSON.parse(result.content[0].text as string)).toEqual([]);
  });

  it("returns isError true when fetch response is not ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const result = await tool.handler({ query: "x" }, {} as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Stops fetch failed: 503");
    expect(result.structuredContent).toBeUndefined();
  });
});
