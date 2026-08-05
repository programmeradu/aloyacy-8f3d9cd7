// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const ingest = vi.fn();
const extrapolate = vi.fn();

vi.mock("../geo-fusion", () => ({
  GeoFuser: vi.fn(() => ({ ingest, extrapolate })),
}));

const { GeoFuser: GeoFuserCtor } = await import("../geo-fusion");

import { useFusedFix } from "../useFusedFix";

describe("useFusedFix", () => {
  let watchPosition: ReturnType<typeof vi.fn>;
  let clearWatch: ReturnType<typeof vi.fn>;
  let successCb: PositionCallback | undefined;
  let errorCb: PositionErrorCallback | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    successCb = undefined;
    errorCb = undefined;
    ingest.mockReset();
    extrapolate.mockReset();
    GeoFuserCtor.mockClear();
    watchPosition = vi.fn((onSuccess, onError) => {
      successCb = onSuccess;
      errorCb = onError;
      return 7;
    });
    clearWatch = vi.fn();
    Object.defineProperty(global.navigator, "geolocation", {
      value: { watchPosition, clearWatch },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error cleanup test stub
    delete global.navigator.geolocation;
  });

  it("does nothing when disabled", () => {
    const { result } = renderHook(() => useFusedFix({ enabled: false }));
    expect(result.current).toEqual({ fix: null, error: null });
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("reports unsupported geolocation when enabled", () => {
    // @ts-expect-error deliberately drop geolocation to test the guard
    delete global.navigator.geolocation;
    const { result } = renderHook(() => useFusedFix({ enabled: true }));
    expect(result.current.error).toBe("Geolocation unsupported");
  });

  it("ingests successful fixes into the GeoFuser and updates fix", () => {
    ingest.mockReturnValue({ lat: 1, lng: 2, accuracyM: 5 });
    const { result } = renderHook(() => useFusedFix({ enabled: true, activePath: null }));

    act(() => {
      successCb!({
        coords: { latitude: 1, longitude: 2, accuracy: 5, speed: 1, heading: 2 },
        timestamp: 111,
      } as GeolocationPosition);
    });

    expect(ingest).toHaveBeenCalledWith(
      { lat: 1, lng: 2, accuracyM: 5, speedMps: 1, headingDeg: 2, timestamp: 111 },
      null,
    );
    expect(result.current.fix).toEqual({ lat: 1, lng: 2, accuracyM: 5 });
    expect(result.current.error).toBeNull();
  });

  it("surfaces geolocation errors", () => {
    const { result } = renderHook(() => useFusedFix({ enabled: true }));
    act(() => {
      errorCb!({ code: 2, message: "timeout" } as GeolocationPositionError);
    });
    expect(result.current.error).toBe("timeout");
  });

  it("dead-reckons at 2 Hz via extrapolate while the sensor is quiet", () => {
    extrapolate.mockReturnValue({ lat: 9, lng: 9, accuracyM: 30 });
    const { result } = renderHook(() => useFusedFix({ enabled: true }));

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(extrapolate).toHaveBeenCalledTimes(1);
    expect(result.current.fix).toEqual({ lat: 9, lng: 9, accuracyM: 30 });
  });

  it("skips extrapolation ticks that return null", () => {
    extrapolate.mockReturnValue(null);
    const { result } = renderHook(() => useFusedFix({ enabled: true }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.fix).toBeNull();
  });

  it("uses the latest activePath ref for both ingest and extrapolate", () => {
    ingest.mockReturnValue({ lat: 1, lng: 1, accuracyM: 1 });
    const path1 = [{ lat: 0, lng: 0 }];
    const path2 = [{ lat: 1, lng: 1 }];
    const { rerender } = renderHook(({ path }) => useFusedFix({ enabled: true, activePath: path }), {
      initialProps: { path: path1 },
    });

    rerender({ path: path2 });

    act(() => {
      successCb!({
        coords: { latitude: 5, longitude: 5, accuracy: 5, speed: null, heading: null },
        timestamp: 5,
      } as GeolocationPosition);
    });
    expect(ingest).toHaveBeenLastCalledWith(expect.anything(), path2);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(extrapolate).toHaveBeenLastCalledWith(expect.any(Number), path2);
  });

  it("clears the watch and interval, and drops the fuser ref, on unmount", () => {
    const { unmount } = renderHook(() => useFusedFix({ enabled: true }));
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(7);
    // No more ticks should call extrapolate after unmount.
    extrapolate.mockClear();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(extrapolate).not.toHaveBeenCalled();
  });
});
