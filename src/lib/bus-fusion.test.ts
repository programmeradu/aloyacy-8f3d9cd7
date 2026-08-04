import { describe, it, expect } from "vitest";
import { fuseBusPosition } from "./bus-fusion";

const NOW = 1_700_000_000_000; // ms

describe("fuseBusPosition", () => {
  it("returns null when there is no vehicle and no rider fix", () => {
    const r = fuseBusPosition({ vehicle: null, riderFix: null, onBus: false, nowMs: NOW });
    expect(r).toBeNull();
  });

  it("uses fresh feed vehicle when rider not on bus", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 2, timestamp: NOW / 1000 - 5, bearing: 90, speedMps: 10 },
      riderFix: null,
      onBus: false,
      nowMs: NOW,
    });
    expect(r).toEqual({ lat: 1, lng: 2, bearing: 90, speedMps: 10, source: "feed", feedAgeSec: 5 });
  });

  it("treats feed with no timestamp as fresh", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 2 },
      riderFix: null,
      onBus: false,
      nowMs: NOW,
    });
    expect(r?.source).toBe("feed");
    expect(r?.feedAgeSec).toBe(0);
  });

  it("blends feed and rider fix when on-bus and close (<80m)", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 1, timestamp: NOW / 1000 - 1, bearing: 45, speedMps: 8 },
      riderFix: { lat: 1.0001, lng: 1.0001, bearingDeg: 50, speedMps: 9, timestamp: NOW },
      onBus: true,
      nowMs: NOW,
    });
    expect(r?.source).toBe("blend");
    expect(r?.lat).toBeCloseTo((1 + 1.0001) / 2, 5);
    expect(r?.speedMps).toBe(9); // prefers rider speed
    expect(r?.bearing).toBe(45); // prefers vehicle bearing
  });

  it("falls back to plain feed when on-bus but rider fix is far away (drift >= 80m)", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 1, timestamp: NOW / 1000 - 1 },
      riderFix: { lat: 1.01, lng: 1.01, timestamp: NOW },
      onBus: true,
      nowMs: NOW,
    });
    expect(r?.source).toBe("feed");
    expect(r?.lat).toBe(1);
  });

  it("trusts rider GPS when feed is stale and rider is on-bus", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 1, timestamp: NOW / 1000 - 100 }, // stale (>45s)
      riderFix: { lat: 2, lng: 2, bearingDeg: 10, speedMps: 3, timestamp: NOW },
      onBus: true,
      nowMs: NOW,
    });
    expect(r?.source).toBe("rider");
    expect(r).toMatchObject({ lat: 2, lng: 2, bearing: 10, speedMps: 3 });
  });

  it("trusts rider GPS when there is no vehicle at all but rider is on-bus", () => {
    const r = fuseBusPosition({
      vehicle: null,
      riderFix: { lat: 2, lng: 2, timestamp: NOW },
      onBus: true,
      nowMs: NOW,
    });
    expect(r?.source).toBe("rider");
  });

  it("returns stale-feed when feed is stale but not dead, and rider not usable", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 5, lng: 5, timestamp: NOW / 1000 - 100 },
      riderFix: null,
      onBus: false,
      nowMs: NOW,
    });
    expect(r?.source).toBe("stale-feed");
    expect(r?.feedAgeSec).toBe(100);
  });

  it("returns null when feed is fully dead (>120s) and rider unusable", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 5, lng: 5, timestamp: NOW / 1000 - 200 },
      riderFix: null,
      onBus: false,
      nowMs: NOW,
    });
    expect(r).toBeNull();
  });

  it("returns null when on-bus but rider fix missing and feed dead", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 5, lng: 5, timestamp: NOW / 1000 - 200 },
      riderFix: null,
      onBus: true,
      nowMs: NOW,
    });
    expect(r).toBeNull();
  });

  it("defaults nowMs to Date.now() when omitted", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 1 },
      riderFix: null,
      onBus: false,
    });
    expect(r?.source).toBe("feed");
  });

  it("snaps result onto shape when close enough", () => {
    const shape = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
    ];
    const r = fuseBusPosition({
      vehicle: { lat: 0.0001, lng: 0.5, timestamp: NOW / 1000 - 1 },
      riderFix: null,
      onBus: false,
      shape,
      nowMs: NOW,
    });
    expect(r).not.toBeNull();
    // Snapped to the line lat=0
    expect(Math.abs(r!.lat)).toBeLessThan(0.0001);
  });

  it("does not snap when the crossM distance is too large", () => {
    const shape = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
    ];
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 0.5, timestamp: NOW / 1000 - 1 }, // ~111km away from line
      riderFix: null,
      onBus: false,
      shape,
      nowMs: NOW,
    });
    expect(r?.lat).toBe(1);
  });

  it("ignores a shape with fewer than 2 points", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 1, timestamp: NOW / 1000 - 1 },
      riderFix: null,
      onBus: false,
      shape: [{ lat: 0, lng: 0 }],
      nowMs: NOW,
    });
    expect(r?.lat).toBe(1);
  });

  it("uses null bearing/speed when vehicle lacks both", () => {
    const r = fuseBusPosition({
      vehicle: { lat: 1, lng: 1, timestamp: NOW / 1000 - 1 },
      riderFix: null,
      onBus: false,
      nowMs: NOW,
    });
    expect(r?.bearing).toBeNull();
    expect(r?.speedMps).toBeNull();
  });
});
