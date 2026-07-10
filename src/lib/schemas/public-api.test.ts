import { describe, it, expect } from "vitest";
import {
  LatLngSchema,
  WeatherQuerySchema,
  PlacesAutocompleteSchema,
  PlaceSchema,
  RouteReliabilitySchema,
  StopReliabilitySchema,
  TripIntentSchema,
  TtsSchema,
  IndexNowQuerySchema,
  TripGroupsEnvelopeSchema,
} from "./public-api";

describe("LatLngSchema", () => {
  it("accepts a Nicosia coordinate", () => {
    expect(LatLngSchema.safeParse({ lat: 35.17, lng: 33.36 }).success).toBe(true);
  });

  it("rejects coordinates outside Cyprus", () => {
    expect(LatLngSchema.safeParse({ lat: 51.5, lng: -0.12 }).success).toBe(false);
    expect(LatLngSchema.safeParse({ lat: 35.17, lng: 133.3 }).success).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(LatLngSchema.safeParse({ lat: "35.17", lng: "33.36" }).success).toBe(false);
  });
});

describe("WeatherQuerySchema", () => {
  it("coerces query-string text into numbers", () => {
    const parsed = WeatherQuerySchema.safeParse({ lat: "34.68", lng: "33.04" });
    expect(parsed.success && parsed.data.lat).toBe(34.68);
  });

  it("rejects empty or nonsense values", () => {
    expect(WeatherQuerySchema.safeParse({ lat: "", lng: "" }).success).toBe(false);
    expect(WeatherQuerySchema.safeParse({ lat: "abc", lng: "33" }).success).toBe(false);
  });
});

describe("PlacesAutocompleteSchema", () => {
  it("trims the query", () => {
    const parsed = PlacesAutocompleteSchema.safeParse({ query: "  Larnaca  " });
    expect(parsed.success && parsed.data.query).toBe("Larnaca");
  });

  it("rejects an empty or oversized query", () => {
    expect(PlacesAutocompleteSchema.safeParse({ query: "   " }).success).toBe(false);
    expect(PlacesAutocompleteSchema.safeParse({ query: "x".repeat(201) }).success).toBe(false);
  });

  it("allows a worldwide bias point", () => {
    expect(
      PlacesAutocompleteSchema.safeParse({ query: "airport", bias: { lat: 0, lng: 0 } }).success,
    ).toBe(true);
  });
});

describe("PlaceSchema", () => {
  it("requires a non-empty place id", () => {
    expect(PlaceSchema.safeParse({ placeId: "ChIJ123" }).success).toBe(true);
    expect(PlaceSchema.safeParse({ placeId: "" }).success).toBe(false);
  });
});

describe("reliability schemas", () => {
  it("caps route ids at the underlying validator's limit", () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);
    expect(RouteReliabilitySchema.safeParse({ routeIds: ids(50) }).success).toBe(true);
    expect(RouteReliabilitySchema.safeParse({ routeIds: ids(51) }).success).toBe(false);
    expect(RouteReliabilitySchema.safeParse({ routeIds: [] }).success).toBe(false);
    expect(StopReliabilitySchema.safeParse({ stopId: "s1", routeIds: ids(30) }).success).toBe(true);
    expect(StopReliabilitySchema.safeParse({ stopId: "s1", routeIds: ids(31) }).success).toBe(false);
    expect(StopReliabilitySchema.safeParse({ routeIds: ["r1"] }).success).toBe(false);
  });
});

describe("TripIntentSchema", () => {
  it("accepts a natural-language question with a clock anchor", () => {
    expect(
      TripIntentSchema.safeParse({
        text: "bus to Larnaca airport at 6pm",
        nowISO: "2026-08-22T14:02:00.000Z",
        tzOffsetMin: 180,
      }).success,
    ).toBe(true);
  });

  it("rejects blank text, bad timestamps and impossible offsets", () => {
    expect(TripIntentSchema.safeParse({ text: "  " }).success).toBe(false);
    expect(TripIntentSchema.safeParse({ text: "hi", nowISO: "tomorrow" }).success).toBe(false);
    expect(TripIntentSchema.safeParse({ text: "hi", tzOffsetMin: 5000 }).success).toBe(false);
  });
});

describe("TtsSchema", () => {
  it("truncates billed input to 400 characters", () => {
    expect(TtsSchema.safeParse({ input: "καλημέρα" }).success).toBe(true);
    const parsed = TtsSchema.safeParse({ input: "α".repeat(500) });
    expect(parsed.success && parsed.data.input.length).toBe(400);
    expect(TtsSchema.safeParse({ input: "   " }).success).toBe(false);
  });

  it("rejects a voice id with unexpected characters", () => {
    expect(TtsSchema.safeParse({ input: "hi", voice: "JrrE7QTGDmQKQuUnqk7H" }).success).toBe(true);
    expect(TtsSchema.safeParse({ input: "hi", voice: "../../etc/passwd" }).success).toBe(false);
  });
});

describe("IndexNowQuerySchema", () => {
  it("accepts a bare hostname and rejects a full URL", () => {
    expect(IndexNowQuerySchema.safeParse({ host: "app.aloya.cy" }).success).toBe(true);
    expect(IndexNowQuerySchema.safeParse({}).success).toBe(true);
    expect(IndexNowQuerySchema.safeParse({ host: "https://app.aloya.cy/" }).success).toBe(false);
  });
});

describe("TripGroupsEnvelopeSchema", () => {
  it("accepts each known action", () => {
    for (const action of ["create", "join", "ping", "leave", "end"]) {
      expect(TripGroupsEnvelopeSchema.safeParse({ action, payload: {} }).success).toBe(true);
    }
  });

  it("rejects an unknown action or a non-object payload", () => {
    expect(TripGroupsEnvelopeSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(TripGroupsEnvelopeSchema.safeParse({ action: "ping", payload: "x" }).success).toBe(false);
  });
});
