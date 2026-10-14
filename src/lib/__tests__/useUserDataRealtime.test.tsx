// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

let authUser: { id: string } | null = null;
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: authUser }),
}));

import { USER_DATA_POLL_MS, useUserDataRealtime } from "../useUserDataRealtime";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useUserDataRealtime(), { wrapper });
  const keys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
  return { spy, hook, keys };
}

describe("useUserDataRealtime (polling)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authUser = null;
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes only public caches when signed out", () => {
    const { keys } = setup();
    vi.advanceTimersByTime(USER_DATA_POLL_MS);
    expect(keys()).toEqual(["alert-counters", "service-alerts"]);
  });

  it("also refreshes the rider's caches when signed in", () => {
    authUser = { id: "u1" };
    const { keys } = setup();
    vi.advanceTimersByTime(USER_DATA_POLL_MS);
    expect(keys()).toEqual(
      expect.arrayContaining(["scheduled-departures", "reminders", "commute-suggestion", "trip-suggestions"]),
    );
  });

  it("refreshes on window focus", () => {
    authUser = { id: "u1" };
    const { spy } = setup();
    window.dispatchEvent(new Event("focus"));
    expect(spy).toHaveBeenCalled();
  });

  it("stops polling after unmount", () => {
    const { spy, hook } = setup();
    hook.unmount();
    vi.advanceTimersByTime(USER_DATA_POLL_MS * 3);
    expect(spy).not.toHaveBeenCalled();
  });
});
