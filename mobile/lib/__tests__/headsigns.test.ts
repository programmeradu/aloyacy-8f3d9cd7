import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "@/lib/api";

// The module keeps module-level cache/inflight/listeners state, so we must
// re-import a fresh instance for every test to observe cold-start behaviour.
async function freshModule() {
  vi.resetModules();
  return import("@/lib/headsigns");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHeadsignSync", () => {
  it("returns null before the index has loaded", async () => {
    const { getHeadsignSync } = await freshModule();
    expect(getHeadsignSync("trip1", "route1")).toBeNull();
  });

  it("returns null for an empty tripId even if cache exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ route1: { trips: { trip1: 0 }, headsigns: ["Downtown"] } }), { status: 200 }),
      ),
    );
    const { getHeadsignSync, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();
    await vi.waitFor(() => expect(getHeadsignSync("trip1", "route1")).toBe("Downtown"));

    expect(getHeadsignSync("", "route1")).toBeNull();
  });

  it("looks up the headsign for a known trip on the given route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ route1: { trips: { tripA: 1 }, headsigns: ["City Center", "Airport"] } }),
          { status: 200 },
        ),
      ),
    );
    const { getHeadsignSync, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await vi.waitFor(() => expect(getHeadsignSync("tripA", "route1")).toBe("Airport"));
  });

  it("falls back to the sole headsign when trip is unmapped but the route has exactly one headsign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ route1: { trips: {}, headsigns: ["Only Destination"] } }), { status: 200 }),
      ),
    );
    const { getHeadsignSync, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await vi.waitFor(() =>
      expect(getHeadsignSync("unknownTrip", "route1")).toBe("Only Destination"),
    );
  });

  it("returns null when trip is unmapped and the route has multiple headsigns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ route1: { trips: {}, headsigns: ["A", "B"] } }), { status: 200 }),
      ),
    );
    const { getHeadsignSync, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await vi.waitFor(() => {
      // wait for cache to be populated by checking a different lookup resolves
      expect(getHeadsignSync("missing", "route1")).toBeNull();
    });
  });

  it("searches other routes when the given routeId has no hit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            route1: { trips: {}, headsigns: ["A", "B"] },
            route2: { trips: { tripX: 0 }, headsigns: ["Found Me"] },
          }),
          { status: 200 },
        ),
      ),
    );
    const { getHeadsignSync, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await vi.waitFor(() => expect(getHeadsignSync("tripX", "route1")).toBe("Found Me"));
  });

  it("searches all routes when no routeId hint is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ route2: { trips: { tripX: 0 }, headsigns: ["Found Me"] } }),
          { status: 200 },
        ),
      ),
    );
    const { getHeadsignSync, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await vi.waitFor(() => expect(getHeadsignSync("tripX")).toBe("Found Me"));
  });

  it("caches an empty index and returns null forever when the fetch response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));
    const { getHeadsignSync, onHeadsignsLoaded, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await new Promise<void>((resolve) => onHeadsignsLoaded(resolve));

    expect(getHeadsignSync("anything", "route1")).toBeNull();
  });

  it("caches an empty index and does not throw when fetch rejects with a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const { getHeadsignSync, onHeadsignsLoaded, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();

    await new Promise<void>((resolve) => onHeadsignsLoaded(resolve));

    expect(getHeadsignSync("anything")).toBeNull();
  });
});

describe("onHeadsignsLoaded", () => {
  it("calls the listener synchronously if the cache is already warm", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    const { onHeadsignsLoaded, prefetchHeadsigns } = await freshModule();
    prefetchHeadsigns();
    await new Promise<void>((resolve) => onHeadsignsLoaded(resolve));

    const lateListener = vi.fn();
    onHeadsignsLoaded(lateListener);

    expect(lateListener).toHaveBeenCalledTimes(1);
  });

  it("notifies every registered listener exactly once when the index loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    const { onHeadsignsLoaded, prefetchHeadsigns } = await freshModule();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    onHeadsignsLoaded(listenerA);
    onHeadsignsLoaded(listenerB);

    prefetchHeadsigns();

    await vi.waitFor(() => {
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });
  });

  it("does not call an unsubscribed listener once the index loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );
    const { onHeadsignsLoaded, prefetchHeadsigns } = await freshModule();
    const listener = vi.fn();
    const unsubscribe = onHeadsignsLoaded(listener);
    unsubscribe();

    prefetchHeadsigns();
    await new Promise((r) => setTimeout(r, 10));

    expect(listener).not.toHaveBeenCalled();
  });

  it("dedupes concurrent loads into a single in-flight fetch call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getHeadsignSync, onHeadsignsLoaded, prefetchHeadsigns } = await freshModule();

    prefetchHeadsigns();
    prefetchHeadsigns();
    prefetchHeadsigns();
    await new Promise<void>((resolve) => onHeadsignsLoaded(resolve));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/gtfs-headsigns`, {
      cache: "force-cache",
    });
    expect(getHeadsignSync("x")).toBeNull();
  });
});
