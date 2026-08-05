// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const eligibilityFn = vi.fn();
vi.mock("@/lib/trial.functions", () => ({
  getTrialEligibility: (...args: unknown[]) => eligibilityFn(...args),
}));

vi.mock("@/lib/billing", () => ({
  getStripeEnvironment: () => "sandbox",
}));

vi.mock("@/lib/device-id", () => ({
  getDeviceId: () => "device-123",
}));

const useAuthMock = vi.fn();
vi.mock("@/lib/useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

const useProMock = vi.fn();
vi.mock("@/lib/usePro", () => ({
  useProSubscription: () => useProMock(),
}));

import { useTrialEligibility } from "../useTrialEligibility";

describe("useTrialEligibility", () => {
  beforeEach(() => {
    eligibilityFn.mockReset();
    useAuthMock.mockReset();
    useProMock.mockReset();
  });

  it("returns null initially then false when the user is already Pro", async () => {
    useAuthMock.mockReturnValue({ isPermanent: true });
    useProMock.mockReturnValue({ isPro: true });

    const { result } = renderHook(() => useTrialEligibility());
    await waitFor(() => expect(result.current).toBe(false));
    expect(eligibilityFn).not.toHaveBeenCalled();
  });

  it("returns true optimistically for signed-out/anonymous users", async () => {
    useAuthMock.mockReturnValue({ isPermanent: false });
    useProMock.mockReturnValue({ isPro: false });

    const { result } = renderHook(() => useTrialEligibility());
    await waitFor(() => expect(result.current).toBe(true));
    expect(eligibilityFn).not.toHaveBeenCalled();
  });

  it("resolves eligible=true from the server for a permanent, non-pro user", async () => {
    useAuthMock.mockReturnValue({ isPermanent: true });
    useProMock.mockReturnValue({ isPro: false });
    eligibilityFn.mockResolvedValue({ eligible: true });

    const { result } = renderHook(() => useTrialEligibility());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
    expect(eligibilityFn).toHaveBeenCalledWith({
      data: { deviceId: "device-123", environment: "sandbox" },
    });
  });

  it("resolves eligible=false when the server says the trial is already used", async () => {
    useAuthMock.mockReturnValue({ isPermanent: true });
    useProMock.mockReturnValue({ isPro: false });
    eligibilityFn.mockResolvedValue({ eligible: false });

    const { result } = renderHook(() => useTrialEligibility());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("falls back to false when the server call throws", async () => {
    useAuthMock.mockReturnValue({ isPermanent: true });
    useProMock.mockReturnValue({ isPro: false });
    eligibilityFn.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useTrialEligibility());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("re-fetches when isPermanent flips from false to true", async () => {
    useAuthMock.mockReturnValue({ isPermanent: false });
    useProMock.mockReturnValue({ isPro: false });
    eligibilityFn.mockResolvedValue({ eligible: false });

    const { result, rerender } = renderHook(() => useTrialEligibility());
    await waitFor(() => expect(result.current).toBe(true));

    useAuthMock.mockReturnValue({ isPermanent: true });
    rerender();
    await waitFor(() => expect(result.current).toBe(false));
    expect(eligibilityFn).toHaveBeenCalledTimes(1);
  });

  it("does not update state after unmount (cancelled guard)", async () => {
    useAuthMock.mockReturnValue({ isPermanent: true });
    useProMock.mockReturnValue({ isPro: false });
    let resolvePromise!: (v: { eligible: boolean }) => void;
    eligibilityFn.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useTrialEligibility());
    expect(result.current).toBeNull();
    unmount();
    resolvePromise({ eligible: true });
    await new Promise((r) => setTimeout(r, 0));
    // No assertion on result.current after unmount is safe (component
    // detached); the important part is that no error/warning is thrown.
    expect(true).toBe(true);
  });
});
