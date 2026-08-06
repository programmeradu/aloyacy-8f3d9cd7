// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const fetchStats = vi.fn();
vi.mock("../eta-stats.functions", () => ({
  getEtaStatsForRoutes: (...args: unknown[]) => fetchStats(...args),
}));

import { useEtaStats } from "../useEtaStats";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useEtaStats", () => {
  beforeEach(() => {
    fetchStats.mockReset();
  });

  it("returns the empty fallback and skips the query for an empty route list", () => {
    const { result } = renderHook(() => useEtaStats([]), { wrapper: makeWrapper() });
    expect(result.current).toEqual({ segments: {}, dwells: {} });
    expect(fetchStats).not.toHaveBeenCalled();
  });

  it("returns the empty fallback while the fetch is pending", () => {
    fetchStats.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEtaStats(["r1"]), { wrapper: makeWrapper() });
    expect(result.current).toEqual({ segments: {}, dwells: {} });
  });

  it("returns fetched segment + dwell stats on success", async () => {
    const data = { segments: { s1: { mean: 10 } }, dwells: { d1: { mean: 5 } } };
    fetchStats.mockResolvedValue(data);

    const { result } = renderHook(() => useEtaStats(["r2", "r1"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current).toEqual(data));
    expect(fetchStats).toHaveBeenCalledWith({ data: { routeIds: ["r1", "r2"] } });
  });

  it("dedupes and sorts routeIds into a stable query key", async () => {
    fetchStats.mockResolvedValue({ segments: {}, dwells: {} });
    renderHook(() => useEtaStats(["b", "a", "a", "b"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(1));
    expect(fetchStats).toHaveBeenCalledWith({ data: { routeIds: ["a", "b"] } });
  });

  it("falls back to the empty maps when the fetch errors", async () => {
    fetchStats.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useEtaStats(["r1"]), { wrapper: makeWrapper() });
    await waitFor(() => expect(fetchStats).toHaveBeenCalled());
    expect(result.current).toEqual({ segments: {}, dwells: {} });
  });

  it("refetches when the route set changes", async () => {
    fetchStats.mockResolvedValue({ segments: {}, dwells: {} });
    const wrapper = makeWrapper();
    const { rerender } = renderHook(({ ids }) => useEtaStats(ids), {
      wrapper,
      initialProps: { ids: ["r1"] },
    });
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(1));

    rerender({ ids: ["r2"] });
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(2));
    expect(fetchStats).toHaveBeenLastCalledWith({ data: { routeIds: ["r2"] } });
  });
});
