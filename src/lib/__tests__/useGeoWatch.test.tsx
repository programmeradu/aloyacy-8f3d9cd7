// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGeoWatch } from "../useGeoWatch";

describe("useGeoWatch", () => {
  let watchPosition: ReturnType<typeof vi.fn>;
  let clearWatch: ReturnType<typeof vi.fn>;
  let successCb: PositionCallback | undefined;
  let errorCb: PositionErrorCallback | undefined;

  beforeEach(() => {
    successCb = undefined;
    errorCb = undefined;
    watchPosition = vi.fn((onSuccess, onError) => {
      successCb = onSuccess;
      errorCb = onError;
      return 42;
    });
    clearWatch = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { watchPosition, clearWatch },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error cleanup test stub
    delete global.navigator.geolocation;
  });

  it("does not start a watch when disabled", () => {
    const { result } = renderHook(() => useGeoWatch(false));
    expect(result.current).toEqual({ fix: null, error: null });
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("reports unsupported geolocation", () => {
    // @ts-expect-error deliberately drop geolocation to test the guard
    delete global.navigator.geolocation;
    const { result } = renderHook(() => useGeoWatch(true));
    expect(result.current.error).toBe("Geolocation unsupported");
  });

  it("starts a high-accuracy watch and applies successful fixes", () => {
    const { result } = renderHook(() => useGeoWatch(true));
    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });

    act(() => {
      successCb!({
        coords: { latitude: 1, longitude: 2, accuracy: 5, speed: 3, heading: 90 },
        timestamp: 1000,
      } as GeolocationPosition);
    });

    expect(result.current.fix).toEqual({
      lat: 1,
      lng: 2,
      accuracyM: 5,
      speedMps: 3,
      headingDeg: 90,
      timestamp: 1000,
    });
    expect(result.current.error).toBeNull();
  });

  it("defaults accuracy to 50 when missing", () => {
    const { result } = renderHook(() => useGeoWatch(true));
    act(() => {
      successCb!({
        coords: { latitude: 1, longitude: 2, accuracy: undefined, speed: null, heading: null },
        timestamp: 1000,
      } as unknown as GeolocationPosition);
    });
    expect(result.current.fix?.accuracyM).toBe(50);
  });

  it("surfaces geolocation errors", () => {
    const { result } = renderHook(() => useGeoWatch(true));
    act(() => {
      errorCb!({ code: 1, message: "denied" } as GeolocationPositionError);
    });
    expect(result.current.error).toBe("denied");
  });

  it("clears the watch on unmount", () => {
    const { unmount } = renderHook(() => useGeoWatch(true));
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it("clears the previous watch and restarts when toggled off then on", () => {
    const { rerender, unmount } = renderHook(({ enabled }) => useGeoWatch(enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    expect(clearWatch).toHaveBeenCalledWith(42);
    rerender({ enabled: true });
    expect(watchPosition).toHaveBeenCalledTimes(2);
    unmount();
  });
});
