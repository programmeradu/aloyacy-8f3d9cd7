// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRealtime, useInvalidateRealtime, useResumeRefresh } from "../useRealtime";

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, client };
}

describe("useRealtime", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("throws on a non-ok response, leaving data undefined", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRealtime(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isStale).toBe(true); // staleSec Infinity when no data
  });

  it("computes freshness, ghost trip ids and rider-confirmed ages on success", async () => {
    const fetchedAt = Math.floor(Date.now() / 1000);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        fetchedAt,
        stale: false,
        ghostTripIds: ["t1", "t2"],
        riderConfirmedTrips: [{ tripId: "t3", ageSec: 12 }],
      }),
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRealtime(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isStale).toBe(false);
    expect(result.current.staleSec).toBeLessThanOrEqual(1);
    expect(result.current.ghostTripIds).toEqual(new Set(["t1", "t2"]));
    expect(result.current.riderConfirmedAge.get("t3")).toBe(12);
  });

  it("flags isStale when the upstream stale flag is set", async () => {
    const fetchedAt = Math.floor(Date.now() / 1000);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ fetchedAt, stale: true, ghostTripIds: [], riderConfirmedTrips: [] }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRealtime(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isStale).toBe(true);
  });

  it("flags isStale when the elapsed time exceeds the threshold", async () => {
    const fetchedAt = Math.floor(Date.now() / 1000) - 120;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ fetchedAt, stale: false, ghostTripIds: [], riderConfirmedTrips: [] }),
    });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRealtime(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleSec).toBeGreaterThan(60);
  });
});

describe("useInvalidateRealtime", () => {
  it("invalidates the gtfs-rt query key", async () => {
    const { Wrapper, client } = makeWrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useInvalidateRealtime(), { wrapper: Wrapper });
    act(() => {
      result.current();
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["gtfs-rt"] });
  });
});

describe("useResumeRefresh", () => {
  const setVisibility = (state: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("calls onResume when the tab was hidden for longer than minHiddenSec", () => {
    vi.useFakeTimers();
    const onResume = vi.fn();
    renderHook(() => useResumeRefresh(onResume, 30));

    setVisibility("hidden");
    vi.advanceTimersByTime(31_000);
    setVisibility("visible");

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("does not call onResume for a short hidden period", () => {
    vi.useFakeTimers();
    const onResume = vi.fn();
    renderHook(() => useResumeRefresh(onResume, 30));

    setVisibility("hidden");
    vi.advanceTimersByTime(5_000);
    setVisibility("visible");

    expect(onResume).not.toHaveBeenCalled();
  });

  it("removes the visibilitychange listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useResumeRefresh(vi.fn()));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    removeSpy.mockRestore();
  });
});
