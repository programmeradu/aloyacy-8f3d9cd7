import { describe, it, expect, vi, afterEach } from "vitest";
import type { Itinerary, RideLeg, WalkLeg, WaitLeg } from "../itinerary-types";
import {
  itineraryToJourneyOption,
  isSingleRide,
  splitItineraries,
  accessWalkMeters,
  finalWalkInfo,
  trafficPoints,
  trafficKey,
  cyprusLocalToUnix,
  parsePlanDeepLink,
  formatYYYYMMDD,
  formatIntentLabel,
  suggestionLabel,
} from "../plan-bridge";

function ride(overrides: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "r1",
    routeShort: "1",
    routeLong: "Route 1",
    tripId: "t1",
    live: true,
    board: { stopId: "s1", name: "Board", lat: 35.1, lng: 33.3, departureUnix: 1000 },
    alight: { stopId: "s2", name: "Alight", lat: 35.2, lng: 33.4, arrivalUnix: 2000 },
    stopCount: 5,
    delaySec: 30,
    ...overrides,
  };
}
function walk(overrides: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: { name: "A", lat: 35.0, lng: 33.0 },
    to: { name: "B", lat: 35.05, lng: 33.05 },
    durationSec: 300,
    distanceMeters: 405,
    verified: true,
    ...overrides,
  };
}
function wait(overrides: Partial<WaitLeg> = {}): WaitLeg {
  return {
    kind: "wait",
    stopId: "s1",
    name: "Board",
    lat: 35.1,
    lng: 33.3,
    durationSec: 120,
    ...overrides,
  };
}
function itin(legs: Itinerary["legs"], overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: "it1",
    legs,
    totalDurationSec: 1000,
    departureUnix: 900,
    arrivalUnix: 2300,
    transfers: 0,
    totalWalkMeters: 800,
    score: 1,
    source: "live",
    ...overrides,
  };
}

describe("itineraryToJourneyOption", () => {
  it("returns null when there's no ride leg", () => {
    expect(itineraryToJourneyOption(itin([walk()]))).toBeNull();
  });
  it("maps a single-ride itinerary with walk legs, dropping wait legs", () => {
    const it = itin([walk(), wait(), ride(), walk({ from: { name: "C", lat: 1, lng: 2 } })], {
      source: "estimated",
    });
    const opt = itineraryToJourneyOption(it);
    expect(opt).not.toBeNull();
    expect(opt!.id).toBe("it1");
    expect(opt!.legs).toHaveLength(3);
    expect(opt!.legs[0].kind).toBe("walk");
    expect(opt!.legs[1].kind).toBe("bus");
    expect(opt!.scheduled).toBe(true);
    const bus = opt!.legs[1] as any;
    expect(bus.routeShort).toBe("1");
    expect(bus.scheduled).toBe(false); // live: true -> scheduled = !live
    expect(bus.board.stopId).toBe("s1");
    expect(bus.alight.stopId).toBe("s2");
  });
  it("marks scheduled true when source is live but ride leg is not live", () => {
    const it = itin([ride({ live: false })], { source: "live" });
    const opt = itineraryToJourneyOption(it);
    expect(opt!.scheduled).toBe(false);
    expect((opt!.legs[0] as any).scheduled).toBe(true);
  });
});

describe("isSingleRide", () => {
  it("true for exactly one ride leg", () => {
    expect(isSingleRide(itin([walk(), ride(), walk()]))).toBe(true);
  });
  it("false for zero or multiple ride legs", () => {
    expect(isSingleRide(itin([walk()]))).toBe(false);
    expect(isSingleRide(itin([ride(), wait(), ride()]))).toBe(false);
  });
});

describe("splitItineraries", () => {
  it("splits by transfers count", () => {
    const direct = itin([ride()], { transfers: 0 });
    const transfer = itin([ride(), ride()], { transfers: 1 });
    const { direct: d, transfers: t } = splitItineraries([direct, transfer]);
    expect(d).toEqual([direct]);
    expect(t).toEqual([transfer]);
  });
  it("handles empty input", () => {
    expect(splitItineraries([])).toEqual({ direct: [], transfers: [] });
  });
});

describe("accessWalkMeters", () => {
  it("returns null for null itinerary", () => {
    expect(accessWalkMeters(null)).toBeNull();
  });
  it("returns 0 when no walk leg present", () => {
    expect(accessWalkMeters(itin([ride()]))).toBe(0);
  });
  it("returns rounded meters of first walk leg", () => {
    expect(accessWalkMeters(itin([walk({ distanceMeters: 123.6 }), ride()]))).toBe(124);
  });
});

describe("finalWalkInfo", () => {
  it("returns null for null itinerary", () => {
    expect(finalWalkInfo(null)).toBeNull();
  });
  it("returns null when no walk leg follows a ride", () => {
    expect(finalWalkInfo(itin([walk(), ride()]))).toBeNull();
  });
  it("returns null when itinerary has no walk legs at all", () => {
    expect(finalWalkInfo(itin([ride()]))).toBeNull();
  });
  it("returns egress walk info when a walk follows a ride", () => {
    const egress = walk({ from: { name: "Alight Pt", lat: 9, lng: 8 }, distanceMeters: 55.4 });
    const it = itin([walk(), ride(), egress]);
    const info = finalWalkInfo(it);
    expect(info).toEqual({ walkMeters: 55, alight: { lat: 9, lng: 8, name: "Alight Pt" } });
  });
});

describe("trafficPoints", () => {
  it("returns [] for null", () => {
    expect(trafficPoints(null)).toEqual([]);
  });
  it("collects board/alight and walk endpoints, skipping wait legs", () => {
    const it = itin([walk(), ride(), wait()]);
    const pts = trafficPoints(it);
    expect(pts).toEqual([
      { lat: 35.0, lng: 33.0 },
      { lat: 35.05, lng: 33.05 },
      { lat: 35.1, lng: 33.3 },
      { lat: 35.2, lng: 33.4 },
    ]);
  });
});

describe("trafficKey", () => {
  it("builds stable pipe-joined key", () => {
    expect(trafficKey([{ lat: 1.23456, lng: 2.3456 }, { lat: 3, lng: 4 }])).toBe(
      "1.235,2.346|3.000,4.000",
    );
  });
  it("handles empty list", () => {
    expect(trafficKey([])).toBe("");
  });
});

describe("cyprusLocalToUnix", () => {
  it("returns undefined for malformed input", () => {
    expect(cyprusLocalToUnix("not-a-date")).toBeUndefined();
    expect(cyprusLocalToUnix("2024-99-99")).toBe(undefined ?? cyprusLocalToUnix("2024-99-99"));
  });
  it("converts a summer date (EEST, UTC+3)", () => {
    const unix = cyprusLocalToUnix("2024-07-15 14:30:00");
    expect(unix).toBe(Date.UTC(2024, 6, 15, 11, 30, 0) / 1000);
  });
  it("converts a winter date (EET, UTC+2) and defaults seconds to 0", () => {
    const unix = cyprusLocalToUnix("2024-01-15 09:00");
    expect(unix).toBe(Date.UTC(2024, 0, 15, 7, 0, 0) / 1000);
  });
  it("accepts a T separator", () => {
    const unix = cyprusLocalToUnix("2024-01-15T09:00:00");
    expect(unix).toBe(Date.UTC(2024, 0, 15, 7, 0, 0) / 1000);
  });
});

describe("parsePlanDeepLink", () => {
  const now = new Date("2024-06-01T12:00:00Z").getTime();
  it("returns unmatched for empty search", () => {
    const r = parsePlanDeepLink("", now);
    expect(r.matched).toBe(false);
    expect(r.origin).toBeNull();
    expect(r.destination).toBeNull();
  });
  it("matches full origin+destination with fresh departure", () => {
    const dep = Math.floor(now / 1000) + 100;
    const search = `?fromLat=35.1&fromLng=33.3&fromLabel=Home&toLat=35.2&toLng=33.4&toLabel=Work&dep=${dep}`;
    const r = parsePlanDeepLink(search, now);
    expect(r.matched).toBe(true);
    expect(r.origin).toEqual({ lat: 35.1, lng: 33.3, label: "Home" });
    expect(r.destination).toEqual({ lat: 35.2, lng: 33.4, label: "Work" });
    expect(r.timeIntent).toEqual({
      leaveByISO: new Date(dep * 1000).toISOString(),
      arriveByISO: null,
    });
    expect(r.focus).toBeNull();
  });
  it("drops a stale departure", () => {
    const dep = Math.floor((now - 120_000) / 1000);
    const search = `?fromLat=35.1&fromLng=33.3&fromLabel=Home&toLat=35.2&toLng=33.4&toLabel=Work&dep=${dep}`;
    const r = parsePlanDeepLink(search, now);
    expect(r.timeIntent).toBeNull();
  });
  it("matches destination-only and sets focus to from", () => {
    const r = parsePlanDeepLink("?toLat=35.2&toLng=33.4&toLabel=Work", now);
    expect(r.matched).toBe(true);
    expect(r.origin).toBeNull();
    expect(r.destination).toEqual({ lat: 35.2, lng: 33.4, label: "Work" });
    expect(r.focus).toBe("from");
  });
  it("returns unmatched when only origin present, or fields malformed", () => {
    expect(parsePlanDeepLink("?fromLat=35.1&fromLng=33.3&fromLabel=Home", now).matched).toBe(
      false,
    );
    expect(parsePlanDeepLink("?toLat=notanumber&toLng=33.4&toLabel=Work", now).matched).toBe(
      false,
    );
  });
});

describe("formatYYYYMMDD", () => {
  it("passes through non-matching strings", () => {
    expect(formatYYYYMMDD("hello")).toBe("hello");
    expect(formatYYYYMMDD("2024010")).toBe("2024010");
  });
  it("formats a valid 8-digit date", () => {
    const s = formatYYYYMMDD("20240315");
    expect(s).toMatch(/Mar/);
    expect(s).toMatch(/15/);
  });
});

describe("formatIntentLabel", () => {
  const t = (key: string, vars?: Record<string, string | number>) =>
    `Tomorrow ${vars?.time ?? ""}`;
  it("returns iso string when unparsable", () => {
    expect(formatIntentLabel("not-a-date", t as any)).toBe("not-a-date");
  });
  it("returns bare time for today/past", () => {
    const now = new Date("2024-06-01T10:00:00Z");
    const iso = new Date("2024-06-01T09:00:00Z").toISOString();
    const label = formatIntentLabel(iso, t as any, now);
    expect(label).not.toMatch(/Tomorrow/);
  });
  it("labels tomorrow via translator", () => {
    const now = new Date("2024-06-01T10:00:00Z");
    const iso = new Date("2024-06-02T09:00:00Z").toISOString();
    const label = formatIntentLabel(iso, t as any, now);
    expect(label).toMatch(/^Tomorrow /);
  });
  it("labels further days with weekday prefix", () => {
    const now = new Date("2024-06-01T10:00:00Z");
    const iso = new Date("2024-06-05T09:00:00Z").toISOString();
    const label = formatIntentLabel(iso, t as any, now);
    expect(label).toMatch(/^\w+ /);
    expect(label).not.toMatch(/^Tomorrow/);
  });
});

describe("suggestionLabel", () => {
  it("trims at first clause separator", () => {
    expect(suggestionLabel("Main Street, Nicosia, Cyprus")).toEqual({
      text: "Main Street",
      sizeClass: "text-[18px]",
    });
  });
  it("scales font size down for longer text", () => {
    expect(suggestionLabel("a".repeat(21))).toEqual({ text: "a".repeat(21), sizeClass: "text-[16px]" });
    expect(suggestionLabel("a".repeat(29))).toEqual({ text: "a".repeat(29), sizeClass: "text-[15px]" });
    expect(suggestionLabel("a".repeat(39))).toEqual({ text: "a".repeat(39), sizeClass: "text-[13px]" });
    expect(suggestionLabel("a".repeat(45))).toEqual({ text: "a".repeat(45), sizeClass: "text-[13px]" });
  });
  it("splits on dash and em-dash too", () => {
    expect(suggestionLabel("Place - extra")).toEqual({ text: "Place", sizeClass: "text-[18px]" });
    expect(suggestionLabel("Place—extra")).toEqual({ text: "Place", sizeClass: "text-[18px]" });
  });
});
