import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import tool from "./get-realtime";

// Optional zod fields are required keys on the inferred handler arg type.
const defaults = { limit: undefined };

// Narrow helpers: MCP content blocks are a union, and inputSchema/content are
// optional on the SDK types even though these tools always populate them.
const textAt = (r: { content?: unknown }, i = 0): string =>
  (r.content as Array<{ text?: string; type?: string }> | undefined)?.[i]?.text ?? "";
const blocks = (r: { content?: unknown }): Array<{ text?: string; type?: string }> =>
  (r.content as Array<{ text?: string; type?: string }> | undefined) ?? [];

describe("get_stop_arrivals tool", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000 * 1000));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("has expected metadata", () => {
    expect(tool.name).toBe("get_stop_arrivals");
    expect(tool.annotations?.idempotentHint).toBe(false);
  });

  it("rejects empty stopId", () => {
    expect(() => tool.inputSchema!.stopId.parse("")).toThrow();
  });

  it("rejects limit outside 1..20", () => {
    expect(() => tool.inputSchema!.limit!.parse(21)).toThrow();
    expect(tool.inputSchema!.limit!.parse(5)).toBe(5);
  });

  it("filters, sorts, slices and adds etaSec on the happy path", async () => {
    const now = 1_700_000_000;
    const arrivals = [
      { stopId: "s1", routeId: "r1", tripId: "t1", arrivalUnix: now + 300, delaySec: 0 },
      { stopId: "s1", routeId: "r2", tripId: "t2", arrivalUnix: now + 100, delaySec: 5 },
      { stopId: "other", routeId: "r3", tripId: "t3", arrivalUnix: now + 50, delaySec: 0 },
      { stopId: "s1", routeId: "r4", tripId: "t4", arrivalUnix: now - 200, delaySec: 0 },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ arrivals, fetchedAt: now, stale: false }),
    });
    const result = await tool.handler({ ...defaults, stopId: "s1" }, {} as never);
    const sc = result.structuredContent as { arrivals: { tripId: string; etaSec: number }[] };
    expect(sc.arrivals.map((a) => a.tripId)).toEqual(["t2", "t1"]);
    expect(sc.arrivals[0].etaSec).toBe(100);
    expect(result.isError).toBeUndefined();
  });

  it("applies the limit", async () => {
    const now = 1_700_000_000;
    const arrivals = Array.from({ length: 3 }, (_, i) => ({
      stopId: "s1",
      routeId: "r",
      tripId: `t${i}`,
      arrivalUnix: now + i * 10,
      delaySec: 0,
    }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ arrivals }) });
    const result = await tool.handler({ ...defaults, stopId: "s1", limit: 1 }, {} as never);
    const sc = result.structuredContent as { arrivals: unknown[] };
    expect(sc.arrivals).toHaveLength(1);
  });

  it("returns a friendly message and empty array when no arrivals", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ arrivals: [] }) });
    const result = await tool.handler({ ...defaults, stopId: "s1" }, {} as never);
    expect(textAt(result, 0)).toBe("No upcoming arrivals for stop s1.");
    expect(result.structuredContent).toEqual({ stopId: "s1", stale: false, arrivals: [] });
  });

  it("propagates stale flag", async () => {
    const now = 1_700_000_000;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        arrivals: [{ stopId: "s1", routeId: "r", tripId: "t", arrivalUnix: now + 10, delaySec: 0 }],
        stale: true,
      }),
    });
    const result = await tool.handler({ ...defaults, stopId: "s1" }, {} as never);
    expect((result.structuredContent as { stale: boolean }).stale).toBe(true);
  });

  it("returns isError on non-ok response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const result = await tool.handler({ ...defaults, stopId: "s1" }, {} as never);
    expect(result.isError).toBe(true);
    expect(textAt(result, 0)).toBe("Realtime fetch failed: 500");
  });
});
