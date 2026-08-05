import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import tool from "./watch-stop";

describe("watch_stop_arrivals tool", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("has expected metadata", () => {
    expect(tool.name).toBe("watch_stop_arrivals");
    expect(tool.annotations?.idempotentHint).toBe(false);
  });

  it("validates alertWithinSec and timeoutSec bounds", () => {
    expect(() => tool.inputSchema.alertWithinSec!.parse(29)).toThrow();
    expect(() => tool.inputSchema.alertWithinSec!.parse(1801)).toThrow();
    expect(() => tool.inputSchema.timeoutSec!.parse(4)).toThrow();
    expect(() => tool.inputSchema.timeoutSec!.parse(26)).toThrow();
  });

  it("triggers immediately when next bus is within the alert window", async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        arrivals: [
          { stopId: "s1", routeId: "r1", tripId: "t1", arrivalUnix: now + 60, delaySec: 0 },
        ],
        stale: false,
      }),
    });
    const result = await tool.handler(
      { stopId: "s1", alertWithinSec: 300, timeoutSec: 5 },
      {} as never,
    );
    const payload = result.structuredContent as {
      triggered: boolean;
      reason: string;
      arrivals: unknown[];
    };
    expect(payload.triggered).toBe(true);
    expect(payload.reason).toBe("within_window");
    expect(payload.arrivals).toHaveLength(1);
    // baseline fetch + first poll fetch
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("filters by routeId when provided", async () => {
    const now = Math.floor(Date.now() / 1000);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        arrivals: [
          { stopId: "s1", routeId: "rA", tripId: "t1", arrivalUnix: now + 30, delaySec: 0 },
          { stopId: "s1", routeId: "rB", tripId: "t2", arrivalUnix: now + 20, delaySec: 0 },
        ],
        stale: false,
      }),
    });
    const result = await tool.handler(
      { stopId: "s1", routeId: "rA", alertWithinSec: 300, timeoutSec: 5 },
      {} as never,
    );
    const payload = result.structuredContent as { arrivals: { routeId: string }[] };
    expect(payload.arrivals.every((a) => a.routeId === "rA")).toBe(true);
  });

  it("returns no_upcoming reason via timeout when there are no arrivals", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ arrivals: [], stale: false }) });
    const promise = tool.handler({ stopId: "s1", timeoutSec: 5 }, {} as never);
    await vi.advanceTimersByTimeAsync(6000);
    const result = await promise;
    const payload = result.structuredContent as { reason: string; triggered: boolean };
    expect(payload.reason).toBe("no_upcoming");
    expect(payload.triggered).toBe(false);
    vi.useRealTimers();
  });

  it("throws when the realtime fetch is not ok (propagated as handler error)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(tool.handler({ stopId: "s1" }, {} as never)).rejects.toThrow("Realtime 500");
  });
});
