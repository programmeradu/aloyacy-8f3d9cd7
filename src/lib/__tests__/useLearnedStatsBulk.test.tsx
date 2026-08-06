// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const getLearnedStatsBulk = vi.fn();
vi.mock("../learning.functions", () => ({
  getLearnedStatsBulk: (...args: unknown[]) => getLearnedStatsBulk(...args),
}));

import { useLearnedStatsBulk } from "../useLearnedStatsBulk";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useLearnedStatsBulk", () => {
  beforeEach(() => {
    getLearnedStatsBulk.mockReset();
  });

  it("is disabled and has no data for an empty stop list", () => {
    const { result } = renderHook(() => useLearnedStatsBulk([]), { wrapper: makeWrapper() });
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe("idle");
    expect(getLearnedStatsBulk).not.toHaveBeenCalled();
  });

  it("groups rows into a Map<stopId, Record<routeId, bias>> on success", async () => {
    getLearnedStatsBulk.mockResolvedValue({
      stats: [
        { stop_id: "s1", route_id: "r1", mean_delay_sec: 20, sample_count: 4 },
        { stop_id: "s1", route_id: "r2", mean_delay_sec: 5, sample_count: 2 },
        { stop_id: "s2", route_id: "r1", mean_delay_sec: 15, sample_count: 1 },
      ],
    });

    const { result } = renderHook(() => useLearnedStatsBulk(["s1", "s2"]), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const byStop = result.current.data!;
    expect(byStop.get("s1")).toEqual({
      r1: { meanDelaySec: 20, sampleCount: 4 },
      r2: { meanDelaySec: 5, sampleCount: 2 },
    });
    expect(byStop.get("s2")).toEqual({ r1: { meanDelaySec: 15, sampleCount: 1 } });
  });

  it("returns an empty map when the response has no rows", async () => {
    getLearnedStatsBulk.mockResolvedValue({ stats: [] });
    const { result } = renderHook(() => useLearnedStatsBulk(["s1"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.size).toBe(0);
  });

  it("surfaces an error state when the fetch rejects", async () => {
    getLearnedStatsBulk.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useLearnedStatsBulk(["s1"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("re-queries with the full stopIds list (unsorted, unlike the cache key)", async () => {
    getLearnedStatsBulk.mockResolvedValue({ stats: [] });
    const wrapper = makeWrapper();
    const { rerender } = renderHook(({ ids }) => useLearnedStatsBulk(ids), {
      wrapper,
      initialProps: { ids: ["b", "a"] },
    });
    await waitFor(() => expect(getLearnedStatsBulk).toHaveBeenCalledTimes(1));
    expect(getLearnedStatsBulk).toHaveBeenCalledWith({ data: { stopIds: ["b", "a"] } });

    rerender({ ids: ["b", "a", "c"] });
    await waitFor(() => expect(getLearnedStatsBulk).toHaveBeenCalledTimes(2));
  });
});
