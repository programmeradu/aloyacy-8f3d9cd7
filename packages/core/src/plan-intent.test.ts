import { describe, expect, it } from "vitest";
import {
  finalWalkLeg,
  firstWalkMeters,
  HANDOFF_TTL_MS,
  intentToUnix,
  isBeyondWalking,
  optionsHeadline,
  originFieldValue,
  parseKapnosLocalUnix,
  parseResolvedHandoff,
  parseSeedHandoff,
  resolveOrigin,
  type LegLike,
} from "./plan-intent";

const walk = (m: number, name = "Stop"): LegLike => ({
  kind: "walk",
  distanceMeters: m,
  from: { name, lat: 34.7, lng: 33.0 },
});
const ride = (): LegLike => ({ kind: "ride" });

describe("intentToUnix", () => {
  it("returns no clock for now", () => {
    expect(intentToUnix({ kind: "now" })).toEqual({});
  });

  it("maps leaveBy and arriveBy to the right field", () => {
    const iso = "2026-08-22T10:00:00.000Z";
    const unix = Math.floor(Date.parse(iso) / 1000);
    expect(intentToUnix({ kind: "leaveBy", iso })).toEqual({ departAtUnix: unix });
    expect(intentToUnix({ kind: "arriveBy", iso })).toEqual({ arriveByUnix: unix });
  });

  it("ignores an unparseable timestamp instead of sending NaN", () => {
    expect(intentToUnix({ kind: "leaveBy", iso: "not a date" })).toEqual({});
  });
});

describe("parseKapnosLocalUnix", () => {
  it("reads a Cyprus wall-clock string as UTC+03:00", () => {
    expect(parseKapnosLocalUnix("2026-08-22 14:30")).toBe(
      Math.floor(Date.parse("2026-08-22T14:30:00+03:00") / 1000),
    );
  });

  it("returns undefined for empty or malformed input", () => {
    expect(parseKapnosLocalUnix("")).toBeUndefined();
    expect(parseKapnosLocalUnix(null)).toBeUndefined();
    expect(parseKapnosLocalUnix("tomorrow-ish")).toBeUndefined();
  });
});

describe("walk legs", () => {
  it("reports the access walk, or zero when the trip starts on a bus", () => {
    expect(firstWalkMeters([walk(240.4), ride()])).toBe(240);
    // Only walking before the first ride counts as access; egress does not.
    expect(firstWalkMeters([ride(), walk(100)])).toBe(0);
    expect(firstWalkMeters([walk(100), walk(50.4), ride(), walk(900)])).toBe(150);
    expect(firstWalkMeters(null)).toBeNull();
  });

  it("returns the egress walk only when a ride precedes it", () => {
    expect(finalWalkLeg([walk(200), ride(), walk(310.6, "Agora")])).toEqual({
      meters: 311,
      alight: { lat: 34.7, lng: 33.0, name: "Agora" },
    });
    expect(finalWalkLeg([walk(400)])).toBeNull();
    expect(finalWalkLeg([ride()])).toBeNull();
  });
});

describe("isBeyondWalking", () => {
  it("treats the 1.2 km threshold as inclusive of walking", () => {
    expect(isBeyondWalking(1_200)).toBe(false);
    expect(isBeyondWalking(1_201)).toBe(true);
    expect(isBeyondWalking(null)).toBe(false);
  });
});

describe("resolveOrigin", () => {
  const fallback = { lat: 34.679, lng: 33.0413, label: "Limassol" };

  it("prefers the live fix when the rider wants their location", () => {
    expect(
      resolveOrigin({ useCurrent: true, fix: { lat: 35, lng: 33 }, picked: null, fallback }),
    ).toEqual({ lat: 35, lng: 33, label: "Current location" });
  });

  it("falls back to the city centroid with no fix", () => {
    expect(resolveOrigin({ useCurrent: true, fix: null, picked: null, fallback })).toEqual(
      fallback,
    );
  });

  it("uses the picked place when the rider chose one", () => {
    const picked = { lat: 35.17, lng: 33.36, label: "Nicosia" };
    expect(
      resolveOrigin({ useCurrent: false, fix: { lat: 35, lng: 33 }, picked, fallback }),
    ).toEqual(picked);
  });
});

describe("handoffs from the Ask Aloya composer", () => {
  const now = 1_700_000_000_000;
  const to = { lat: 35.17, lng: 33.36, label: "Nicosia" };

  it("accepts a fresh resolved handoff and derives the time intent", () => {
    const raw = JSON.stringify({ to, at: now - 1_000, arriveByISO: "2026-08-22T09:00:00.000Z" });
    expect(parseResolvedHandoff(raw, now)).toEqual({
      kind: "resolved",
      to,
      from: null,
      intent: { kind: "arriveBy", iso: "2026-08-22T09:00:00.000Z" },
    });
  });

  it("drops a stale or malformed handoff", () => {
    expect(parseResolvedHandoff(JSON.stringify({ to, at: now - HANDOFF_TTL_MS }), now)).toBeNull();
    expect(parseResolvedHandoff("{oops", now)).toBeNull();
    expect(parseResolvedHandoff(JSON.stringify({ at: now }), now)).toBeNull();
    expect(parseResolvedHandoff(null, now)).toBeNull();
  });

  it("accepts a raw text seed and trims it", () => {
    expect(parseSeedHandoff(JSON.stringify({ text: "  airport  ", at: now }), now)).toEqual({
      kind: "seed",
      text: "airport",
    });
    expect(parseSeedHandoff(JSON.stringify({ text: "   ", at: now }), now)).toBeNull();
    expect(parseSeedHandoff(JSON.stringify({ text: "x", at: now - 90_000 }), now)).toBeNull();
  });
});

describe("copy", () => {
  it("pluralises the options headline", () => {
    expect(optionsHeadline(1, "live")).toBe("1 OPTION · LIVE");
    expect(optionsHeadline(3, "mixed")).toBe("3 OPTIONS · MIXED");
    expect(optionsHeadline(0, "live")).toBe("NO OPTIONS");
  });

  it("explains every FROM-field state", () => {
    expect(originFieldValue({ useCurrent: true, hasFix: true, hasError: false })).toBe(
      "Current location",
    );
    expect(originFieldValue({ useCurrent: true, hasFix: false, hasError: true })).toBe(
      "Location unavailable",
    );
    expect(originFieldValue({ useCurrent: true, hasFix: false, hasError: false })).toBe(
      "Tap Locate me to use your position",
    );
    expect(
      originFieldValue({ useCurrent: false, hasFix: true, hasError: false, pickedLabel: "Agora" }),
    ).toBe("Agora");
    expect(
      originFieldValue({ useCurrent: false, hasFix: true, hasError: false, pickedLabel: "  " }),
    ).toBe("Pick a starting point");
  });
});
