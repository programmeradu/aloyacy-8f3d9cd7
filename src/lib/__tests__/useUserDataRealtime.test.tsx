// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

let authUser: { id: string } | null = null;
vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: authUser }),
}));

type Handler = (payload: unknown) => void;
type Sub = { table: string; filter?: string; handler: Handler };

const removeChannelMock = vi.fn();
let channels: Record<string, { subs: Sub[] }> = {};

function makeChannel(name: string) {
  channels[name] = { subs: [] };
  const chan = {
    on: (_event: string, config: { table: string; filter?: string }, handler: Handler) => {
      channels[name].subs.push({ table: config.table, filter: config.filter, handler });
      return chan;
    },
    subscribe: () => chan,
  };
  return chan;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (name: string) => makeChannel(name),
    removeChannel: (chan: unknown) => removeChannelMock(chan),
  },
}));

import { useUserDataRealtime } from "../useUserDataRealtime";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, client, invalidateSpy };
}

describe("useUserDataRealtime", () => {
  beforeEach(() => {
    authUser = null;
    channels = {};
    removeChannelMock.mockClear();
  });

  it("subscribes only to the public alert-counters channel when signed out", () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    expect(Object.keys(channels)).toEqual(["rt-alert-counters"]);
  });

  it("invalidates alert-counters and service-alerts caches on a counter change", () => {
    const { Wrapper, invalidateSpy } = makeWrapper();
    renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    channels["rt-alert-counters"].subs[0].handler({});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["alert-counters"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["service-alerts"] });
  });

  it("also opens a per-user channel with scoped filters when signed in", () => {
    authUser = { id: "user-1" };
    const { Wrapper } = makeWrapper();
    renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    expect(Object.keys(channels)).toEqual(["rt-alert-counters", "rt-user-user-1"]);
    const subs = channels["rt-user-user-1"].subs;
    expect(subs.find((s) => s.table === "scheduled_departures")?.filter).toBe("user_id=eq.user-1");
    expect(subs.find((s) => s.table === "commute_patterns")?.filter).toBe("user_id=eq.user-1");
  });

  it("invalidates scheduled-departures and reminders on a scheduled_departures change", () => {
    authUser = { id: "user-2" };
    const { Wrapper, invalidateSpy } = makeWrapper();
    renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    const sub = channels["rt-user-user-2"].subs.find((s) => s.table === "scheduled_departures")!;
    sub.handler({});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["scheduled-departures"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reminders"] });
  });

  it("invalidates commute-suggestion and trip-suggestions on a commute_patterns change", () => {
    authUser = { id: "user-3" };
    const { Wrapper, invalidateSpy } = makeWrapper();
    renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    const sub = channels["rt-user-user-3"].subs.find((s) => s.table === "commute_patterns")!;
    sub.handler({});
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["commute-suggestion"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["trip-suggestions"] });
  });

  it("removes only the public channel on unmount when signed out", () => {
    const { Wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });

  it("removes both channels on unmount when signed in", () => {
    authUser = { id: "user-4" };
    const { Wrapper } = makeWrapper();
    const { unmount } = renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(2);
  });

  it("re-subscribes to a new per-user channel when the signed-in user id changes", () => {
    authUser = { id: "user-5" };
    const { Wrapper } = makeWrapper();
    const { rerender } = renderHook(() => useUserDataRealtime(), { wrapper: Wrapper });
    expect(Object.keys(channels)).toContain("rt-user-user-5");
    authUser = { id: "user-6" };
    rerender();
    expect(Object.keys(channels)).toContain("rt-user-user-6");
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
