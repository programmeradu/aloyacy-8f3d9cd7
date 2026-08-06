// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompass, requestCompassPermission } from "../useCompass";

function dispatchOrientation(detail: { webkitCompassHeading?: number; alpha?: number; absolute?: boolean }) {
  const evt = new Event("deviceorientation") as DeviceOrientationEvent;
  Object.defineProperty(evt, "webkitCompassHeading", { value: detail.webkitCompassHeading, configurable: true });
  Object.defineProperty(evt, "alpha", { value: detail.alpha ?? null, configurable: true });
  Object.defineProperty(evt, "absolute", { value: detail.absolute ?? false, configurable: true });
  act(() => {
    window.dispatchEvent(evt);
  });
}

describe("useCompass", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when DeviceOrientationEvent is absent", () => {
    const orig = (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent;
    // @ts-expect-error simulate unsupported browser
    delete window.DeviceOrientationEvent;
    const { result } = renderHook(() => useCompass(true));
    expect(result.current.supported).toBe(false);
    expect(result.current.headingDeg).toBeNull();
    (window as unknown as { DeviceOrientationEvent: unknown }).DeviceOrientationEvent = orig;
  });

  it("does not attach a listener when disabled", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useCompass(false));
    expect(addSpy).not.toHaveBeenCalledWith("deviceorientation", expect.any(Function), true);
    addSpy.mockRestore();
  });

  it("prefers webkitCompassHeading over alpha", () => {
    const { result } = renderHook(() => useCompass(true));
    dispatchOrientation({ webkitCompassHeading: 90 });
    expect(result.current.headingDeg).toBeCloseTo(90, 0);
  });

  it("derives heading from absolute alpha when webkit heading is absent", () => {
    const { result } = renderHook(() => useCompass(true));
    dispatchOrientation({ alpha: 90, absolute: true });
    expect(result.current.headingDeg).toBeCloseTo(270, 0);
  });

  it("ignores non-absolute alpha with no webkit heading", () => {
    const { result } = renderHook(() => useCompass(true));
    dispatchOrientation({ alpha: 90, absolute: false });
    expect(result.current.headingDeg).toBeNull();
  });

  it("smooths successive readings instead of jumping instantly", () => {
    const { result } = renderHook(() => useCompass(true));
    dispatchOrientation({ webkitCompassHeading: 0 });
    const first = result.current.headingDeg;
    dispatchOrientation({ webkitCompassHeading: 100 });
    const second = result.current.headingDeg!;
    expect(first).toBe(0);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(100);
  });

  it("removes the listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useCompass(true));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("deviceorientation", expect.any(Function), true);
    removeSpy.mockRestore();
  });

  it("re-attaches the listener when toggled from disabled to enabled", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const { rerender } = renderHook((enabled: boolean) => useCompass(enabled), {
      initialProps: false,
    });
    expect(addSpy).not.toHaveBeenCalledWith("deviceorientation", expect.any(Function), true);
    rerender(true);
    expect(addSpy).toHaveBeenCalledWith("deviceorientation", expect.any(Function), true);
    addSpy.mockRestore();
  });
});

describe("requestCompassPermission", () => {
  afterEach(() => {
    // @ts-expect-error cleanup test-added requestPermission
    delete window.DeviceOrientationEvent?.requestPermission;
  });

  it("resolves to 'granted' when no permission API exists (Android)", async () => {
    const result = await requestCompassPermission();
    expect(result).toBe("granted");
  });

  it("delegates to DeviceOrientationEvent.requestPermission when present (iOS)", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    (window.DeviceOrientationEvent as unknown as { requestPermission: unknown }).requestPermission =
      requestPermission;
    const result = await requestCompassPermission();
    expect(result).toBe("granted");
    expect(requestPermission).toHaveBeenCalled();
  });

  it("returns 'denied' when the iOS prompt throws", async () => {
    (window.DeviceOrientationEvent as unknown as { requestPermission: unknown }).requestPermission =
      vi.fn().mockRejectedValue(new Error("nope"));
    const result = await requestCompassPermission();
    expect(result).toBe("denied");
  });
});
