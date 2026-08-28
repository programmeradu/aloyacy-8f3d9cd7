import { describe, it, expect, beforeEach } from "vitest";
import { smartEtaV2 } from "../eta-v2";
import { setStops } from "../gtfs";
import type { RealtimeArrival, RealtimeVehicle } from "../api";

const NOW = 1_700_000_000;

function arrival(over: Partial<RealtimeArrival>): RealtimeArrival {
  return { stopId: "s1", routeId: "r1", tripId: "t1", arrivalUnix: NOW + 300, delaySec: 0, ...over };
}
function vehicle(over: Partial<RealtimeVehicle>): RealtimeVehicle {
  return {
    id: "v1", routeId: "r1", tripId: "t1", lat: 35.17, lng: 33.36, bearing: 0,
    speed: 8, label: null, timestamp: NOW, source: "feed", ...over,
  };
}

describe("smartEtaV2", () => {
  beforeEach(() => {
    setStops([]);
  });

  it("returns null when no arrivals match the stop", () => {
    expect(smartEtaV2({ stopId: "s1", arrivals: [], vehicles: [], nowSec: NOW })).toBeNull();
  });

  it("filters out arrivals older than 30s in the past", () => {
    const arrivals = [arrival({ arrivalUnix: NOW - 60 })];
    expect(smartEtaV2({ stopId: "s1", arrivals, vehicles: [], nowSec: NOW })).toBeNull();
  });

  it("picks the earliest of multiple matching arrivals", () => {
    const arrivals = [
      arrival({ tripId: "late", arrivalUnix: NOW + 600 }),
      arrival({ tripId: "early", arrivalUnix: NOW + 120 }),
    ];
    const result = smartEtaV2({ stopId: "s1", arrivals, vehicles: [], nowSec: NOW });
    expect(result?.etaMin).toBe(2);
  });

  it("fallback path (no geometry) uses operator ETA and scheduled tier without a vehicle", () => {
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const result = smartEtaV2({ stopId: "s1", arrivals, vehicles: [], nowSec: NOW });
    expect(result).not.toBeNull();
    expect(result!.operatorEtaMin).toBe(5);
    expect(result!.tier).toBe("scheduled");
    expect(result!.freshness).toBe("scheduled");
    expect(result!.stopsAway).toBe(0);
    expect(result!.band).toBe("≈5 min");
  });

  it("fallback path applies learned bias when sample count is sufficient", () => {
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const result = smartEtaV2({
      stopId: "s1",
      arrivals,
      vehicles: [],
      nowSec: NOW,
      learnedByRoute: { r1: { meanDelaySec: 120, sampleCount: 10 } },
    });
    // 300s operator + 120*0.6=72s bias = 372s => 6 min rounded
    expect(result!.etaMin).toBe(6);
    expect(result!.learnedBiasSec).toBe(120);
  });

  it("ignores learned bias below the minimum sample threshold", () => {
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const result = smartEtaV2({
      stopId: "s1",
      arrivals,
      vehicles: [],
      nowSec: NOW,
      learnedByRoute: { r1: { meanDelaySec: 600, sampleCount: 1 } },
    });
    expect(result!.learnedBiasSec).toBe(0);
    expect(result!.etaMin).toBe(5);
  });

  it("uses rider-confirmed sighting age when it is fresher than the feed ping", () => {
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const vehicles = [vehicle({ timestamp: NOW - 500 })];
    const result = smartEtaV2({
      stopId: "s1", arrivals, vehicles, nowSec: NOW, riderConfirmedAgeSec: 5,
    });
    expect(result!.pingAgeSec).toBe(5);
    expect(result!.tier).toBe("rider-confirmed");
    expect(result!.singleSource).toBe(true);
  });

  it("labels a rider-GPS vehicle as rider-confirmed without a separate sighting", () => {
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const vehicles = [vehicle({ timestamp: NOW - 8, source: "rider" })];
    const result = smartEtaV2({
      stopId: "s1", arrivals, vehicles, nowSec: NOW,
    });
    expect(result!.tier).toBe("rider-confirmed");
    expect(result!.singleSource).toBe(true);
    expect(result!.pingAgeSec).toBe(8);
  });

  it("computes a geometry-based ETA across multiple stops with segment stats", () => {
    setStops([
      { id: "s0", agency: "urban", lat: 35.17, lng: 33.36 } as any,
      { id: "s1", agency: "urban", lat: 35.18, lng: 33.37 } as any,
      { id: "s2", agency: "urban", lat: 35.19, lng: 33.38 } as any,
    ]);
    const arrivals = [
      arrival({ stopId: "s0", tripId: "t1", arrivalUnix: NOW + 60 }),
      arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW + 300 }),
      arrival({ stopId: "s2", tripId: "t1", arrivalUnix: NOW + 600 }),
    ];
    const vehicles = [vehicle({ lat: 35.17, lng: 33.36, timestamp: NOW })];
    const result = smartEtaV2({
      stopId: "s1",
      arrivals,
      vehicles,
      nowSec: NOW,
      segments: { "r1|s0|s1": { meanMps: 10, sampleCount: 12 } },
      dwells: { "r1|s1": { meanDwellSec: 15, sampleCount: 12 } },
    });
    expect(result).not.toBeNull();
    expect(result!.stopsAway).toBeGreaterThanOrEqual(0);
    expect(result!.etaSec).toBeGreaterThan(0);
    expect(result!.lowerSec).toBeLessThanOrEqual(result!.upperSec);
  });

  it("falls back to fewer than 2 usable stops when gtfs has no matching stop data", () => {
    setStops([]); // getStop returns undefined for everything -> verts stays empty
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const result = smartEtaV2({ stopId: "s1", arrivals, vehicles: [], nowSec: NOW });
    expect(result!.stopsAway).toBe(0);
  });

  it("marks pessimism higher when ping is stale beyond PING_STALE_SEC", () => {
    setStops([
      { id: "s0", agency: "urban", lat: 35.17, lng: 33.36 } as any,
      { id: "s1", agency: "urban", lat: 35.20, lng: 33.40 } as any,
    ]);
    const arrivals = [
      arrival({ stopId: "s0", tripId: "t1", arrivalUnix: NOW + 60 }),
      arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW + 900 }),
    ];
    const staleVehicles = [vehicle({ timestamp: NOW - 200 })];
    const stale = smartEtaV2({ stopId: "s1", arrivals, vehicles: staleVehicles, nowSec: NOW });
    expect(stale!.pingAgeSec).toBeGreaterThan(90);
  });

  it("blurb reports usual lateness when learned bias is large and tier is trustworthy", () => {
    const arrivals = [arrival({ arrivalUnix: NOW + 300 })];
    const vehicles = [vehicle({ timestamp: NOW })];
    const result = smartEtaV2({
      stopId: "s1",
      arrivals,
      vehicles,
      nowSec: NOW,
      learnedByRoute: { r1: { meanDelaySec: 180, sampleCount: 20 } },
    });
    expect(result!.blurb).toMatch(/usually \d+ min late/);
  });

  it("uses the intercity fallback speed/dwell for IC agency", () => {
    setStops([
      { id: "s0", agency: "IC", lat: 35.0, lng: 33.0 } as any,
      { id: "s1", agency: "IC", lat: 35.3, lng: 33.3 } as any,
    ]);
    const arrivals = [
      arrival({ stopId: "s0", tripId: "t1", arrivalUnix: NOW + 60 }),
      arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW + 3600 }),
    ];
    const result = smartEtaV2({
      stopId: "s1", arrivals, vehicles: [], nowSec: NOW, agency: "IC",
    });
    expect(result).not.toBeNull();
  });
});
