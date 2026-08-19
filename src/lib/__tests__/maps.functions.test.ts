import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";

const placesAutocompleteMock = vi.fn();
const resolvePlaceMock = vi.fn();
const reverseGeocodeMock = vi.fn();
const walkingDirectionsMock = vi.fn();
const drivingRouteMock = vi.fn();

vi.mock("../maps.server", () => ({
  placesAutocomplete: (...args: unknown[]) => placesAutocompleteMock(...args),
  resolvePlace: (...args: unknown[]) => resolvePlaceMock(...args),
  reverseGeocode: (...args: unknown[]) => reverseGeocodeMock(...args),
  walkingDirections: (...args: unknown[]) => walkingDirectionsMock(...args),
  drivingRoute: (...args: unknown[]) => drivingRouteMock(...args),
}));

const { autocompletePlaces, getPlace, reverseLookup, getWalkingDirections, getDriveEta } =
  await import("../maps.functions");

beforeEach(() => {
  placesAutocompleteMock.mockReset();
  resolvePlaceMock.mockReset();
  reverseGeocodeMock.mockReset();
  walkingDirectionsMock.mockReset();
  drivingRouteMock.mockReset();
});

const PT = { lat: 35.17, lng: 33.36 };

describe("autocompletePlaces", () => {
  it("returns suggestions on success", async () => {
    placesAutocompleteMock.mockResolvedValue([{ placeId: "p1", primary: "A", secondary: "B" }]);
    const out = await callServerFn(autocompletePlaces, { query: "airport" });
    expect(out.suggestions).toHaveLength(1);
  });

  it("swallows errors and returns an empty list", async () => {
    placesAutocompleteMock.mockRejectedValue(new Error("boom"));
    const out = await callServerFn(autocompletePlaces, { query: "airport" });
    expect(out.suggestions).toEqual([]);
  });
});

describe("getPlace", () => {
  it("passes through the resolved place", async () => {
    resolvePlaceMock.mockResolvedValue({ name: "Airport", lat: 1, lng: 2 });
    const out = await callServerFn(getPlace, { placeId: "ChIJabc123" });
    expect(out).toEqual({ name: "Airport", lat: 1, lng: 2 });
  });

  it("rejects an invalid place id", async () => {
    await expect(callServerFn(getPlace, { placeId: "not valid!" })).rejects.toThrow();
  });
});

describe("reverseLookup", () => {
  it("returns the address", async () => {
    reverseGeocodeMock.mockResolvedValue("123 Main St");
    const out = await callServerFn(reverseLookup, PT);
    expect(out.address).toBe("123 Main St");
  });
});

describe("getWalkingDirections", () => {
  it("returns directions on success", async () => {
    walkingDirectionsMock.mockResolvedValue({ steps: [], durationSec: 300 });
    const out = await callServerFn(getWalkingDirections, { from: PT, to: PT });
    expect(out.directions).toEqual({ steps: [], durationSec: 300 });
    expect(walkingDirectionsMock).toHaveBeenCalledWith(PT, PT, "en");
  });

  it("uses the provided locale", async () => {
    walkingDirectionsMock.mockResolvedValue({ steps: [], durationSec: 300 });
    await callServerFn(getWalkingDirections, { from: PT, to: PT, locale: "el" });
    expect(walkingDirectionsMock).toHaveBeenCalledWith(PT, PT, "el");
  });

  it("returns null directions on failure", async () => {
    walkingDirectionsMock.mockRejectedValue(new Error("boom"));
    const out = await callServerFn(getWalkingDirections, { from: PT, to: PT });
    expect(out.directions).toBeNull();
  });
});

describe("getDriveEta", () => {
  it("returns the driving route", async () => {
    drivingRouteMock.mockResolvedValue({ durationSec: 600, distanceM: 5000 });
    const out = await callServerFn(getDriveEta, { from: PT, to: PT });
    expect(out.route).toEqual({ durationSec: 600, distanceM: 5000 });
  });

  it("rejects out-of-range coordinates", async () => {
    await expect(
      callServerFn(getDriveEta, { from: { lat: 1000, lng: 0 }, to: PT }),
    ).rejects.toThrow();
  });
});
