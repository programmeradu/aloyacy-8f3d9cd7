// Regression: after the Mapbox migration, tapping a place search result on the
// trip planner did nothing for many results. Search ids are `mbx.` + base64url
// of the place JSON, which often exceeds 300 chars (Greek names/addresses), and
// getPlace's validator capped ids at 300, so the pick threw and was swallowed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { placesAutocomplete } from "../maps.server";
import { PlaceSchema } from "../schemas/public-api";

const { getPlace } = await import("../maps.functions");

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const GREEK_POI = {
  properties: {
    mapbox_id: "dXJuOm1ieHBvaTo2ZDVjNjc3YS1kMGQxLTRiNjctYTNmMS1mYjYxOTkyMmM4MzU",
    feature_type: "poi",
    name: "Διεθνές Αεροδρόμιο Λάρνακας «Γλαύκος Κληρίδης»",
    place_formatted: "Λάρνακα, Κύπρος",
    full_address: "Λεωφόρος Αρχιεπισκόπου Μακαρίου Γ΄, Λάρνακα 6015, Κύπρος",
    coordinates: { latitude: 34.8751, longitude: 33.6249 },
  },
};

describe("picking a Mapbox search result", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = "pk.test";
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  it("resolves a long (>300 char) mbx id through getPlace without another lookup", async () => {
    fetchMock.mockResolvedValueOnce(json({ features: [GREEK_POI] }));
    const [s] = await placesAutocomplete("αεροδρόμιο λάρνακας");
    expect(s.placeId.startsWith("mbx.")).toBe(true);
    expect(s.placeId.length).toBeGreaterThan(300);

    const place = await callServerFn(getPlace, { placeId: s.placeId });
    expect(place.name).toBe(GREEK_POI.properties.name);
    expect(place.lat).toBeCloseTo(34.8751);
    expect(place.lng).toBeCloseTo(33.6249);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The public (mobile) endpoint accepts the same id.
    expect(PlaceSchema.safeParse({ placeId: s.placeId }).success).toBe(true);
  });

  it("still rejects path-like ids", async () => {
    await expect(callServerFn(getPlace, { placeId: "mbx../../etc" })).rejects.toThrow();
    await expect(callServerFn(getPlace, { placeId: "a/b" })).rejects.toThrow();
  });
});
