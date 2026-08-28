import { describe, it, expect } from "vitest";
import {
  TripAlertsTickSchema,
  parseOptionalJsonBody,
  LatLngSchema,
  WeatherQuerySchema,
  PlacesAutocompleteSchema,
  PlaceSchema,
  RouteReliabilitySchema,
  StopReliabilitySchema,
  StopRunHintsSchema,
  BoardQuerySchema,
  TripIntentSchema,
  TtsSchema,
  IndexNowQuerySchema,
  TripGroupsEnvelopeSchema,
  IngestScheduleBodySchema,
  StripeEnvQuerySchema,
  EtaLogSchema,
  PartnerApplySchema,
  StopConditionSchema,
  StopPhotoSchema,
  FeedDeltaSchema,
  StopSkipSchema,
  StopSkipReportSchema,
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
    expect(StopReliabilitySchema.safeParse({ stopId: "s1", routeIds: ids(31) }).success).toBe(
      false,
    );
    expect(StopReliabilitySchema.safeParse({ routeIds: ["r1"] }).success).toBe(false);
    expect(StopRunHintsSchema.safeParse({ routeIds: ids(30) }).success).toBe(true);
    expect(StopRunHintsSchema.safeParse({ routeIds: ids(31) }).success).toBe(false);
    expect(StopRunHintsSchema.safeParse({ routeIds: [] }).success).toBe(false);
    expect(StopRunHintsSchema.safeParse({ routeIds: ["r1"], stopId: "s1" }).success).toBe(true);
  });
});

describe("BoardQuerySchema", () => {
  it("accepts agency:short pairs", () => {
    expect(BoardQuerySchema.safeParse({ q: "IC:45,NPT:31" }).success).toBe(true);
    expect(BoardQuerySchema.safeParse({ q: "PFO:615,LCA:425" }).success).toBe(true);
  });

  it("rejects a bare short name, junk, and an oversized query", () => {
    expect(BoardQuerySchema.safeParse({ q: "nope" }).success).toBe(false);
    expect(BoardQuerySchema.safeParse({ q: "45" }).success).toBe(false);
    expect(BoardQuerySchema.safeParse({ q: "ic:45" }).success).toBe(false);
    expect(BoardQuerySchema.safeParse({ q: "x".repeat(401) }).success).toBe(false);
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
    expect(TripGroupsEnvelopeSchema.safeParse({ action: "ping", payload: "x" }).success).toBe(
      false,
    );
  });
});

describe("IngestScheduleBodySchema", () => {
  it("treats an empty body as the default window", () => {
    const parsed = IngestScheduleBodySchema.safeParse(undefined);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.days).toBeUndefined();
  });

  it("accepts a day count inside the supported window", () => {
    expect(IngestScheduleBodySchema.safeParse({ days: 1, force: true }).success).toBe(true);
    expect(IngestScheduleBodySchema.safeParse({ days: 14 }).success).toBe(true);
  });

  it("rejects a window the ingest cannot serve", () => {
    expect(IngestScheduleBodySchema.safeParse({ days: 0 }).success).toBe(false);
    expect(IngestScheduleBodySchema.safeParse({ days: 200 }).success).toBe(false);
    expect(IngestScheduleBodySchema.safeParse({ days: 3.5 }).success).toBe(false);
  });
});

describe("StripeEnvQuerySchema", () => {
  it("defaults to sandbox when the caller omits the environment", () => {
    const parsed = StripeEnvQuerySchema.safeParse({});
    expect(parsed.success && parsed.data.env).toBe("sandbox");
  });

  it("accepts the two real environments", () => {
    expect(StripeEnvQuerySchema.safeParse({ env: "live" }).success).toBe(true);
    expect(StripeEnvQuerySchema.safeParse({ env: "sandbox" }).success).toBe(true);
  });

  it("rejects an unknown environment instead of silently downgrading it", () => {
    expect(StripeEnvQuerySchema.safeParse({ env: "prod" }).success).toBe(false);
  });
});

describe("TripAlertsTickSchema", () => {
  it("accepts an empty tick — the scheduler posts no body", () => {
    expect(TripAlertsTickSchema.safeParse({}).success).toBe(true);
  });

  it("accepts an operator batch limit", () => {
    expect(TripAlertsTickSchema.safeParse({ limit: 100 }).success).toBe(true);
  });

  it("rejects a fractional, zero, negative or absurd limit", () => {
    for (const limit of [1.5, 0, -1, 5_001]) {
      expect(TripAlertsTickSchema.safeParse({ limit }).success, String(limit)).toBe(false);
    }
  });

  it("rejects a numeric string rather than coercing it", () => {
    expect(TripAlertsTickSchema.safeParse({ limit: "100" }).success).toBe(false);
  });

  it("rejects unknown keys so a typo fails loudly", () => {
    expect(TripAlertsTickSchema.safeParse({ limitt: 10 }).success).toBe(false);
  });
});

describe("parseOptionalJsonBody", () => {
  const post = (body?: string) =>
    new Request("http://x/api/public/trip-alerts", { method: "POST", body });

  it("treats an absent body as an empty object", async () => {
    expect(await parseOptionalJsonBody(post(), TripAlertsTickSchema)).toEqual({
      ok: true,
      data: {},
    });
  });

  it("treats a whitespace-only body as an empty object", async () => {
    expect(await parseOptionalJsonBody(post("   \n"), TripAlertsTickSchema)).toEqual({
      ok: true,
      data: {},
    });
  });

  it("parses a well-formed body", async () => {
    expect(
      await parseOptionalJsonBody(post(JSON.stringify({ limit: 7 })), TripAlertsTickSchema),
    ).toEqual({ ok: true, data: { limit: 7 } });
  });

  it("reports malformed JSON without throwing", async () => {
    expect(await parseOptionalJsonBody(post("{oops"), TripAlertsTickSchema)).toEqual({
      ok: false,
      error: "body is not valid JSON",
    });
  });

  it("reports schema failures with a readable message", async () => {
    const result = await parseOptionalJsonBody(
      post(JSON.stringify({ limit: "lots" })),
      TripAlertsTickSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("rejects a JSON array where an object is required", async () => {
    const result = await parseOptionalJsonBody(post("[1,2,3]"), TripAlertsTickSchema);
    expect(result.ok).toBe(false);
  });
});

describe("EtaLogSchema", () => {
  const row = {
    tripId: "t1",
    routeId: "r1",
    stopId: "s1",
    horizonSec: 240,
    p50Sec: 240,
    tier: "live",
    confidence: "high",
    surface: "stop-card",
  };

  it("accepts a sampled prediction", () => {
    expect(EtaLogSchema.safeParse(row).success).toBe(true);
  });

  it("rejects an unknown tier or surface", () => {
    expect(EtaLogSchema.safeParse({ ...row, tier: "maybe" }).success).toBe(false);
    expect(EtaLogSchema.safeParse({ ...row, surface: "console" }).success).toBe(false);
  });
});

describe("PartnerApplySchema", () => {
  const body = {
    orgName: "Hotel Fig Tree",
    contactName: "Maria",
    email: "ops@example.com",
    role: "hotel",
    useCase: "Concierge screens at the desk.",
  };

  it("accepts a waitlist application", () => {
    expect(PartnerApplySchema.safeParse(body).success).toBe(true);
  });

  it("rejects a short use case and a bad email", () => {
    expect(PartnerApplySchema.safeParse({ ...body, useCase: "hi" }).success).toBe(false);
    expect(PartnerApplySchema.safeParse({ ...body, email: "not-an-email" }).success).toBe(false);
  });
});

describe("StopConditionSchema", () => {
  it("accepts a get and a shelter report", () => {
    expect(StopConditionSchema.safeParse({ action: "get", stopId: "1009" }).success).toBe(true);
    expect(
      StopConditionSchema.safeParse({
        action: "report",
        deviceId: "device-01",
        stopId: "1009",
        attribute: "has_shelter",
        value: "yes",
      }).success,
    ).toBe(true);
  });

  it("rejects a short device id and an unknown attribute", () => {
    expect(StopConditionSchema.safeParse({ action: "get", stopId: "" }).success).toBe(false);
    expect(
      StopConditionSchema.safeParse({
        action: "report",
        deviceId: "short",
        stopId: "1009",
        attribute: "has_shelter",
        value: "yes",
      }).success,
    ).toBe(false);
    expect(
      StopConditionSchema.safeParse({
        action: "report",
        deviceId: "device-01",
        stopId: "1009",
        attribute: "shade",
        value: "yes",
      }).success,
    ).toBe(false);
  });
});

describe("StopPhotoSchema", () => {
  it("accepts a get and an upload, and rejects a short device and a huge body", () => {
    expect(StopPhotoSchema.safeParse({ action: "get", stopId: "1009" }).success).toBe(true);
    expect(
      StopPhotoSchema.safeParse({
        action: "upload",
        deviceId: "device-01",
        stopId: "1009",
        mime: "image/jpeg",
        imageBase64: "A".repeat(64),
      }).success,
    ).toBe(true);
    expect(
      StopPhotoSchema.safeParse({
        action: "upload",
        deviceId: "short",
        stopId: "1009",
        mime: "image/jpeg",
        imageBase64: "A".repeat(64),
      }).success,
    ).toBe(false);
    expect(
      StopPhotoSchema.safeParse({
        action: "upload",
        deviceId: "device-01",
        stopId: "1009",
        mime: "image/gif",
        imageBase64: "A".repeat(64),
      }).success,
    ).toBe(false);
  });
});

describe("FeedDeltaSchema", () => {
  it("accepts a stop and rejects an empty id", () => {
    expect(FeedDeltaSchema.safeParse({ stopId: "1009" }).success).toBe(true);
    expect(FeedDeltaSchema.safeParse({ stopId: "" }).success).toBe(false);
  });
});

describe("StopSkipSchema", () => {
  it("accepts a stop and rejects an empty id", () => {
    expect(StopSkipSchema.safeParse({ stopId: "1009" }).success).toBe(true);
    expect(StopSkipSchema.safeParse({ stopId: "" }).success).toBe(false);
  });
});

describe("StopSkipReportSchema", () => {
  it("accepts get and report, and rejects a short device id", () => {
    expect(StopSkipReportSchema.safeParse({ action: "get", stopId: "1009" }).success).toBe(true);
    expect(
      StopSkipReportSchema.safeParse({
        action: "report",
        stopId: "1009",
        deviceId: "abcd1234",
      }).success,
    ).toBe(true);
    expect(
      StopSkipReportSchema.safeParse({
        action: "report",
        stopId: "1009",
        deviceId: "short",
      }).success,
    ).toBe(false);
  });
});
