// @vitest-environment jsdom
// Regression: the device location used to overwrite an origin given in a deep
// link (/trips?fromLat=…&toLat=…, the "Open this plan in Aloya" link) because
// the geolocation effect ran in the same commit, before the URL's origin had
// landed in state. A fix or reverse-geocode resolving late could also replace
// an origin the rider had just picked.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reverseLookup = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/maps.functions", () => ({
  reverseLookup: (...a: unknown[]) => reverseLookup(...a),
}));

const { useTripSeed } = await import("./useTripSeed");

const GPS = { lat: 35.1, lng: 33.2 };
let gpsSuccess: ((p: { coords: { latitude: number; longitude: number } }) => void) | null = null;

beforeEach(() => {
  reverseLookup.mockReset();
  reverseLookup.mockResolvedValue({ address: "Device street" });
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("aloya:geo", JSON.stringify({ ...GPS, ts: Date.now() }));
  gpsSuccess = null;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (ok: typeof gpsSuccess) => {
        gpsSuccess = ok;
      },
    },
  });
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("useTripSeed origin", () => {
  it("keeps the origin from a deep link even when GPS (cached and live) is available", async () => {
    window.history.replaceState(
      {},
      "",
      "/trips?fromLabel=Larnaca%20Marina&fromLat=34.91&fromLng=33.64&toLabel=Paphos&toLat=34.77&toLng=32.42",
    );
    const { result } = renderHook(() => useTripSeed());
    await flush();
    act(() => gpsSuccess?.({ coords: { latitude: GPS.lat, longitude: GPS.lng } }));
    await flush();

    expect(result.current.origin).toEqual({ lat: 34.91, lng: 33.64, label: "Larnaca Marina" });
    expect(result.current.destination?.label).toBe("Paphos");
    expect(reverseLookup).not.toHaveBeenCalled();
  });

  it("keeps the origin from the Ask Aloya hand-off", async () => {
    sessionStorage.setItem(
      "aloya:nl-plan",
      JSON.stringify({ from: { lat: 34.7, lng: 33.0, label: "Limassol" }, to: { lat: 35, lng: 33, label: "X" } }),
    );
    const { result } = renderHook(() => useTripSeed());
    await flush();
    act(() => gpsSuccess?.({ coords: { latitude: GPS.lat, longitude: GPS.lng } }));
    await flush();
    expect(result.current.origin?.label).toBe("Limassol");
  });

  it("uses the device location when no origin was given", async () => {
    window.history.replaceState({}, "", "/trips?toLabel=Paphos&toLat=34.77&toLng=32.42");
    const { result } = renderHook(() => useTripSeed());
    await waitFor(() => expect(result.current.origin?.label).toBe("Device street"));
    expect(result.current.origin).toMatchObject(GPS);
  });

  it("never lets a late GPS fix replace an origin the rider picked", async () => {
    let resolveAddress: (v: { address: string }) => void = () => {};
    reverseLookup.mockImplementation(() => new Promise((r) => (resolveAddress = r)));
    const { result } = renderHook(() => useTripSeed());
    await flush();
    const picked = { lat: 34.68, lng: 33.04, label: "Limassol Old Port" };
    act(() => result.current.setOrigin(picked));
    await act(async () => resolveAddress({ address: "Device street" }));
    act(() => gpsSuccess?.({ coords: { latitude: GPS.lat, longitude: GPS.lng } }));
    await flush();
    expect(result.current.origin).toEqual(picked);
  });
});
