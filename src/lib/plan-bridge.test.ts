import { describe, expect, it } from "vitest";
import type { Itinerary, Leg } from "@/lib/itinerary-types";
import {
  accessWalkMeters,
  cyprusLocalToUnix,
  finalWalkInfo,
  formatIntentLabel,
  formatYYYYMMDD,
  isSingleRide,
  itineraryToJourneyOption,
  parsePlanDeepLink,
  splitItineraries,
  suggestionLabel,
  trafficKey,
  trafficPoints,
} from "@/lib/plan-bridge";

const walk = (from: [number, number], to: [number, number], distanceMeters = 400): Leg =>
  ({
    kind: "walk",
    from: { lat: from[0], lng: from[1], name: "A" },
    to: { lat: to[0], lng: to[1], name: "B" },
    durationSec: 300,
    distanceMeters,
  }) as Leg;

const ride = (routeShort = "30", live = true): Leg =>
  ({
    kind: "ride",
    routeId: "r1",
    routeShort,
    routeLong: "Long name",
    tripId: "t1",
    live,
    delaySec: 60,
    board: { stopId: "s1", name: "Board", lat: 35.1, lng: 33.3, departureUnix: 1_000 },
    alight: { stopId: "s2", name: "Alight", lat: 35.2, lng: 33.4, arrivalUnix: 2_000 },
  }) as Leg;

const itinerary = (legs: Leg[], over: Partial<Itinerary> = {}): Itinerary =>
  ({
    id: "it1",
    legs,
    totalDurationSec: 1_800,
    departureUnix: 1_000,
    arrivalUnix: 2_800,
    transfers: legs.filter((l) => l.kind === "ride").length - 1,
    source: "live",
    ...over,
  }) as Itinerary;

describe("itineraryToJourneyOption", () => {
  it("returns null when there is no ride leg", () => {
    expect(itineraryToJourneyOption(itinerary([walk([35, 33], [35.01, 33.01])]))).toBeNull();
  });

  it("maps walk and ride legs and drops wait legs", () => {
    const it = itinerary([
      walk([35, 33], [35.1, 33.3]),
      { kind: "wait", durationSec: 120 } as Leg,
      ride(),
      walk([35.2, 33.4], [35.21, 33.41], 250),
    ]);
    const opt = itineraryToJourneyOption(it)!;
    expect(opt.legs.map((l) => l.kind)).toEqual(["walk", "bus", "walk"]);
    const bus = opt.legs[1] as Extract<(typeof opt.legs)[number], { kind: "bus" }>;
    expect(bus.routeShort).toBe("30");
    expect(bus.scheduled).toBe(false);
    expect(opt.scheduled).toBe(false);
  });

  it("marks the option scheduled when the itinerary is not live", () => {
    const opt = itineraryToJourneyOption(itinerary([ride("30", false)], { source: "schedule" }))!;
    expect(opt.scheduled).toBe(true);
  });
});

describe("itinerary shape helpers", () => {
  it("detects single-ride itineraries", () => {
    expect(isSingleRide(itinerary([ride()]))).toBe(true);
    expect(isSingleRide(itinerary([ride(), ride("40")]))).toBe(false);
  });

  it("splits direct trips from transfer trips", () => {
    const a = itinerary([ride()], { id: "a", transfers: 0 });
    const b = itinerary([ride(), ride()], { id: "b", transfers: 1 });
    const { direct, transfers } = splitItineraries([a, b]);
    expect(direct.map((i) => i.id)).toEqual(["a"]);
    expect(transfers.map((i) => i.id)).toEqual(["b"]);
  });

  it("reports the access walk distance, and zero when the trip starts on the bus", () => {
    expect(accessWalkMeters(itinerary([walk([35, 33], [35.1, 33.3], 380), ride()]))).toBe(380);
    expect(accessWalkMeters(itinerary([ride()]))).toBe(0);
    expect(accessWalkMeters(null)).toBeNull();
  });

  it("only counts a final walk that follows a ride", () => {
    const withEgress = itinerary([ride(), walk([35.2, 33.4], [35.25, 33.45], 900)]);
    expect(finalWalkInfo(withEgress)).toEqual({
      walkMeters: 900,
      alight: { lat: 35.2, lng: 33.4, name: "A" },
    });
    // Walk-only trip: no handoff to offer.
    expect(finalWalkInfo(itinerary([walk([35, 33], [35.01, 33.01])]))).toBeNull();
    expect(finalWalkInfo(itinerary([ride()]))).toBeNull();
  });

  it("collects traffic sample points and a stable key", () => {
    const pts = trafficPoints(itinerary([walk([35, 33], [35.1, 33.3]), ride()]));
    expect(pts).toHaveLength(4);
    expect(trafficKey(pts)).toBe("35.000,33.000|35.100,33.300|35.100,33.300|35.200,33.400");
    expect(trafficPoints(null)).toEqual([]);
  });
});

describe("cyprusLocalToUnix", () => {
  it("resolves summer time (UTC+3)", () => {
    // 2026-07-01 09:00 Nicosia === 06:00Z
    expect(cyprusLocalToUnix("2026-07-01 09:00:00")).toBe(Date.UTC(2026, 6, 1, 6) / 1000);
  });

  it("resolves winter time (UTC+2)", () => {
    expect(cyprusLocalToUnix("2026-01-15 09:00:00")).toBe(Date.UTC(2026, 0, 15, 7) / 1000);
  });

  it("accepts an ISO-style separator and missing seconds", () => {
    expect(cyprusLocalToUnix("2026-01-15T09:00")).toBe(Date.UTC(2026, 0, 15, 7) / 1000);
  });

  it("returns undefined for unparseable input", () => {
    expect(cyprusLocalToUnix("tomorrow morning")).toBeUndefined();
  });
});

describe("parsePlanDeepLink", () => {
  const now = Date.UTC(2026, 4, 1, 10, 0, 0);

  it("hydrates both endpoints and a fresh departure", () => {
    const dep = Math.floor(now / 1000) + 600;
    const r = parsePlanDeepLink(
      `?fromLat=35.1&fromLng=33.3&fromLabel=Home&toLat=34.7&toLng=32.4&toLabel=Paphos&dep=${dep}`,
      now,
    );
    expect(r.matched).toBe(true);
    expect(r.origin).toEqual({ lat: 35.1, lng: 33.3, label: "Home" });
    expect(r.destination?.label).toBe("Paphos");
    expect(r.timeIntent).toEqual({
      leaveByISO: new Date(dep * 1000).toISOString(),
      arriveByISO: null,
    });
  });

  it("ignores a stale departure so the trip replans from now", () => {
    const dep = Math.floor(now / 1000) - 3_600;
    const r = parsePlanDeepLink(
      `?fromLat=35.1&fromLng=33.3&fromLabel=Home&toLat=34.7&toLng=32.4&toLabel=Paphos&dep=${dep}`,
      now,
    );
    expect(r.timeIntent).toBeNull();
  });

  it("accepts a destination-only link and asks for the pickup", () => {
    const r = parsePlanDeepLink("?toLat=34.7&toLng=32.4&toLabel=Paphos", now);
    expect(r).toMatchObject({ matched: true, origin: null, focus: "from" });
  });

  it("ignores links with coordinates but no label", () => {
    expect(parsePlanDeepLink("?toLat=34.7&toLng=32.4", now).matched).toBe(false);
    expect(parsePlanDeepLink("", now).matched).toBe(false);
  });
});

describe("formatting helpers", () => {
  it("formats a GTFS service date and passes other strings through", () => {
    expect(formatYYYYMMDD("20260314")).toMatch(/Mar/);
    expect(formatYYYYMMDD("later today")).toBe("later today");
  });

  it("shows bare time today, a spelled-out tomorrow, and a weekday beyond", () => {
    const t = (_k: "trips.intentTomorrow", vars?: Record<string, string | number>) =>
      `Tomorrow ${vars?.time}`;
    const now = new Date(2026, 4, 1, 8, 0, 0);
    const today = new Date(2026, 4, 1, 17, 30, 0);
    const tomorrow = new Date(2026, 4, 2, 9, 15, 0);
    const later = new Date(2026, 4, 6, 9, 15, 0);
    expect(formatIntentLabel(today.toISOString(), t, now)).not.toMatch(/Tomorrow/);
    expect(formatIntentLabel(tomorrow.toISOString(), t, now)).toMatch(/^Tomorrow /);
    expect(formatIntentLabel(later.toISOString(), t, now)).toMatch(/^Wed /);
    expect(formatIntentLabel("not-a-date", t, now)).toBe("not-a-date");
  });

  it("trims suggestion labels to the first clause and scales long ones down", () => {
    expect(suggestionLabel("Larnaca Airport, Cyprus").text).toBe("Larnaca Airport");
    expect(suggestionLabel("Home").sizeClass).toBe("text-[18px]");
    expect(suggestionLabel("A".repeat(45)).sizeClass).toBe("text-[13px]");
    expect(suggestionLabel("A".repeat(30)).sizeClass).toBe("text-[15px]");
    expect(suggestionLabel("A".repeat(24)).sizeClass).toBe("text-[16px]");
  });
});
