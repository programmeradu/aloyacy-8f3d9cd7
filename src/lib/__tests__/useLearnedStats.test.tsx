// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const getLearnedStatsForStop = vi.fn();
vi.mock("../learning.functions", () => ({
  getLearnedStatsForStop: (...args: unknown[]) => getLearnedStatsForStop(...args),
}));

import { useLearnedStats } from "../useLearnedStats";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useLearnedStats", () => {
  beforeEach(() => {
    getLearnedStatsForStop.mockReset();
  });

  it("is disabled and has no data for an empty stop list", () => {
    const { result } = renderHook(() => useLearnedStats([]), { wrapper: makeWrapper() });
    expect(result.current.data).toBeUndefined();
    expect(result.current.fetchStatus).toBe("idle");
    expect(getLearnedStatsForStop).not.toHaveBeenCalled();
  });

  it("builds a nested Map<stopId, Map<routeId, stat>> on success", async () => {
    getLearnedStatsForStop.mockImplementation(({ data }: { data: { stopId: string } }) =>
      Promise.resolve({
        stats:
          data.stopId === "s1"
            ? [{ route_id: "r1", mean_delay_sec: 30 }]
            : [{ route_id: "r2", mean_delay_sec: 10 }],
      }),
    );

    const { result } = renderHook(() => useLearnedStats(["s1", "s2"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const map = result.current.data!;
    expect(map.get("s1")?.get("r1")).toEqual({ route_id: "r1", mean_delay_sec: 30 });
    expect(map.get("s2")?.get("r2")).toEqual({ route_id: "r2", mean_delay_sec: 10 });
  });

  it("produces empty inner maps when a stop has no stats rows", async () => {
    getLearnedStatsForStop.mockResolvedValue({ stats: [] });
    const { result } = renderHook(() => useLearnedStats(["s1"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.get("s1")?.size).toBe(0);
  });

  it("surfaces an error state when a fetch rejects", async () => {
    getLearnedStatsForStop.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useLearnedStats(["s1"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("re-queries when the stop set changes", async () => {
    getLearnedStatsForStop.mockResolvedValue({ stats: [] });
    const wrapper = makeWrapper();
    const { rerender } = renderHook(({ ids }) => useLearnedStats(ids), {
      wrapper,
      initialProps: { ids: ["s1"] },
    });
    await waitFor(() => expect(getLearnedStatsForStop).toHaveBeenCalledTimes(1));

    rerender({ ids: ["s1", "s2"] });
    await waitFor(() => expect(getLearnedStatsForStop).toHaveBeenCalledTimes(3));
  });
});
