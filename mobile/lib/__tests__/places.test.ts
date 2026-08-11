import { afterEach, describe, expect, it, vi } from "vitest";
import { autocompletePlaces, resolvePlace } from "@/lib/places";
import { API_BASE } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("autocompletePlaces", () => {
  it("POSTs the query and bias to the autocomplete endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestions: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await autocompletePlaces({ query: "Nicosia", bias: { lat: 35.1, lng: 33.3 } });

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/places-autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: "Nicosia", bias: { lat: 35.1, lng: 33.3 } }),
    });
  });

  it("returns the suggestions array from the response", async () => {
    const suggestions = [{ placeId: "1", primary: "Nicosia", secondary: "Cyprus" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ suggestions }), { status: 200 })));

    await expect(autocompletePlaces({ query: "N" })).resolves.toEqual(suggestions);
  });

  it("falls back to an empty array when suggestions is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));

    await expect(autocompletePlaces({ query: "N" })).resolves.toEqual([]);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 500 })));

    await expect(autocompletePlaces({ query: "N" })).rejects.toThrow("Autocomplete 500");
  });

  it("does not retry against a second base on failure (single-base client)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(autocompletePlaces({ query: "N" })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolvePlace", () => {
  it("POSTs the placeId to the place endpoint", async () => {
    const place = { placeId: "abc", name: "Nicosia", address: "Cyprus", lat: 35.1, lng: 33.3 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(place), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolvePlace("abc");

    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/public/place`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ placeId: "abc" }),
    });
    expect(result).toEqual(place);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));

    await expect(resolvePlace("missing")).rejects.toThrow("Place 404");
  });
});
