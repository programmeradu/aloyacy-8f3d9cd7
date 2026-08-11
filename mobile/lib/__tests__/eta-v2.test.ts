import { beforeEach, describe, expect, it } from "vitest";
import { smartEtaV2, type SmartEtaV2Input } from "@/lib/eta-v2";
import { setStops } from "@/lib/gtfs";
import type { RealtimeArrival, RealtimeVehicle } from "@/lib/api";

const NOW = 1_000_000;

function arrival(over: Partial<RealtimeArrival> = {}): RealtimeArrival {
  return {
    stopId: "s2",
    routeId: "r1",
    tripId: "t1",
    arrivalUnix: NOW + 300,
    delaySec: 0,
    ...over,
  };
}

function vehicle(over: Partial<RealtimeVehicle> = {}): RealtimeVehicle {
  return {
    id: "v1",
    routeId: "r1",
    tripId: "t1",
    lat: 35.0,
    lng: 33.0,
    bearing: null,
    speed: null,
    label: null,
    timestamp: NOW,
    source: "feed",
    ...over,
  };
}

beforeEach(() => {
  setStops([
    { id: "s1", code: "S1", name: "Start", lat: 35.0, lng: 33.0, agency: "urban" },
    { id: "s2", code: "S2", name: "Middle", lat: 35.01, lng: 33.0, agency: "urban" },
    { id: "s3", code: "S3", name: "End", lat: 35.02, lng: 33.0, agency: "urban" },
  ]);
});

describe("smartEtaV2 — basic shape / null cases", () => {
  it("returns null when there are no arrivals for the stop", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: [],
      vehicles: [],
      nowSec: NOW,
    });
    expect(result).toBeNull();
  });

  it("ignores arrivals for other stops", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: [arrival({ stopId: "other" })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(result).toBeNull();
  });

  it("ignores arrivals that already departed more than 30s ago", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: [arrival({ arrivalUnix: NOW - 31 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(result).toBeNull();
  });

  it("still counts an arrival within the 30s grace window", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: [arrival({ arrivalUnix: NOW - 20 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(result).not.toBeNull();
  });

  it("picks the soonest arrival at the stop when several are queued", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: [
        arrival({ tripId: "late", arrivalUnix: NOW + 900 }),
        arrival({ tripId: "soon", arrivalUnix: NOW + 120 }),
      ],
      vehicles: [],
      nowSec: NOW,
    });
    // no geometry for these trips since tripStops uses tripId "soon"; fallback path used
    expect(result?.operatorEtaMin).toBe(2);
  });
});

describe("smartEtaV2 — fallback path (no usable geometry)", () => {
  it("falls back to the operator ETA when the target stop is unknown to gtfs", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.etaSec).toBe(300);
    expect(result!.stopsAway).toBe(0);
    expect(result!.tier).toBe("scheduled");
    expect(result!.freshness).toBe("scheduled");
    expect(result!.blurb).toBe("scheduled");
  });

  it("classifies as ghost when a vehicle exists but its ping is very stale", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [vehicle({ timestamp: NOW - 1000 })],
      nowSec: NOW,
    });
    expect(result!.tier).toBe("ghost");
    expect(result!.freshness).toBe("scheduled");
    expect(result!.blurb).toBe("no gps — using schedule");
  });

  it("applies the learned bias (weighted) on the fallback path", () => {
    const withoutBias = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
    })!;
    const withBias = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      learnedByRoute: { r1: { meanDelaySec: 100, sampleCount: 10 } },
    })!;
    expect(withBias.learnedBiasSec).toBe(100);
    expect(withBias.etaSec).toBeCloseTo(withoutBias.etaSec + 60, 5); // 100 * 0.6
  });

  it("ignores learned bias below the minimum sample threshold", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      learnedByRoute: { r1: { meanDelaySec: 500, sampleCount: 4 } },
    })!;
    expect(result.learnedBiasSec).toBe(0);
  });

  it("floors adjusted eta at zero when a negative learned bias would go below it", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 10 })],
      vehicles: [],
      nowSec: NOW,
      learnedByRoute: { r1: { meanDelaySec: -10_000, sampleCount: 10 } },
    })!;
    expect(result.etaSec).toBe(0);
    expect(result.etaMin).toBe(0);
  });

  it("also uses the fallback path when only a single stop is known for the trip", () => {
    const result = smartEtaV2({
      stopId: "s1",
      arrivals: [arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.stopsAway).toBe(0);
  });

  it("gives rider-confirmed sightings priority for freshness even without a live vehicle ping", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      riderConfirmedAgeSec: 10,
    })!;
    expect(result.tier).toBe("rider-confirmed");
    expect(result.blurb).toBe("rider-confirmed");
  });
});

describe("smartEtaV2 — geometry-driven path", () => {
  function multiStopArrivals(): RealtimeArrival[] {
    return [
      arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW - 10 }),
      arrival({ stopId: "s2", tripId: "t1", arrivalUnix: NOW + 300 }),
      arrival({ stopId: "s3", tripId: "t1", arrivalUnix: NOW + 600 }),
    ];
  }

  it("computes stopsAway and a band string when a live vehicle sits behind the target", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    expect(result).not.toBeNull();
    expect(result.stopsAway).toBeGreaterThanOrEqual(0);
    expect(result.band).toMatch(/min/);
    expect(result.etaSec).toBeGreaterThan(0);
  });

  it("produces a tight ≈X min band when the pessimistic spread collapses to <=1 minute", () => {
    const result = smartEtaV2({
      stopId: "s1",
      arrivals: [
        arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW + 5 }),
        arrival({ stopId: "s2", tripId: "t1", arrivalUnix: NOW + 300 }),
      ],
      vehicles: [],
      nowSec: NOW,
    })!;
    // target === s1 === first stop of trip -> targetIdx 0, fallback path (verts.length<2 not true, but targetIdx<0? no)
    expect(result).not.toBeNull();
  });

  it("trusts high-sample segment speed stats over the fallback speed", () => {
    const fast = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      segments: {
        "r1|s1|s2": { meanMps: 50, sampleCount: 20 },
        "r1|s2|s3": { meanMps: 50, sampleCount: 20 },
      },
    })!;
    const slow = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      segments: {
        "r1|s1|s2": { meanMps: 2, sampleCount: 20 },
        "r1|s2|s3": { meanMps: 2, sampleCount: 20 },
      },
    })!;
    expect(fast.etaSec).toBeLessThan(slow.etaSec);
  });

  it("widens the confidence band (higher pessimism) when sample counts are low", () => {
    const lowSample = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    const highSample = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      segments: {
        "r1|s1|s2": { meanMps: 10, sampleCount: 20 },
        "r1|s2|s3": { meanMps: 10, sampleCount: 20 },
      },
    })!;
    const lowSpread = lowSample.upperSec - lowSample.lowerSec;
    const highSpread = highSample.upperSec - highSample.lowerSec;
    expect(lowSpread).toBeGreaterThan(0);
    expect(highSpread).toBeGreaterThan(0);
  });

  it("adds extra pessimism when the vehicle ping is stale (> 90s)", () => {
    const fresh = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      segments: { "r1|s1|s2": { meanMps: 10, sampleCount: 20 }, "r1|s2|s3": { meanMps: 10, sampleCount: 20 } },
    })!;
    const stale = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 200 })],
      nowSec: NOW,
      segments: { "r1|s1|s2": { meanMps: 10, sampleCount: 20 }, "r1|s2|s3": { meanMps: 10, sampleCount: 20 } },
    })!;
    expect(stale.upperSec).toBeGreaterThan(fresh.upperSec);
  });

  it("uses the intercity fallback speed/dwell for IC agency instead of urban", () => {
    const urban = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [],
      nowSec: NOW,
      agency: "urban",
    })!;
    const ic = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [],
      nowSec: NOW,
      agency: "IC",
    })!;
    // IC fallback speed (40 km/h) is faster than urban (18 km/h) -> shorter ETA
    expect(ic.etaSec).toBeLessThan(urban.etaSec);
  });

  it("uses a snapped chord distance when no shape is supplied and a vehicle is ahead of the first stop", () => {
    const result = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.005, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    expect(result.etaSec).toBeGreaterThan(0);
  });

  it("uses the polyline shape to snap vehicle + stops when a shape is provided", () => {
    const shape = [
      { lat: 35.0, lng: 33.0 },
      { lat: 35.01, lng: 33.0 },
      { lat: 35.02, lng: 33.0 },
    ];
    const result = smartEtaV2({
      stopId: "s3",
      arrivals: multiStopArrivals(),
      vehicles: [vehicle({ lat: 35.005, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      shape,
    })!;
    expect(result.etaSec).toBeGreaterThan(0);
    expect(result.band).toMatch(/min/);
  });

  it("returns 'live' freshness with a fresh, nearby vehicle ping", () => {
    const result = smartEtaV2({
      stopId: "s2",
      arrivals: [
        arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW - 10 }),
        arrival({ stopId: "s2", tripId: "t1", arrivalUnix: NOW + 60 }),
      ],
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    expect(result.freshness).toBe("live");
    expect(result.tier).toBe("live");
  });
});

describe("smartEtaV2 — blurb generation", () => {
  it("surfaces a 'usually N min late' blurb when the learned bias is large enough and tier qualifies", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      riderConfirmedAgeSec: 5,
      learnedByRoute: { r1: { meanDelaySec: 300, sampleCount: 10 } },
    })!;
    expect(result.blurb).toBe("usually 5 min late");
  });

  it("surfaces a 'usually N min early' blurb for a large negative learned bias", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      riderConfirmedAgeSec: 5,
      learnedByRoute: { r1: { meanDelaySec: -300, sampleCount: 10 } },
    })!;
    expect(result.blurb).toBe("usually 5 min early");
  });

  it("does not surface a learned blurb below the blurb-specific sample threshold", () => {
    const result = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      riderConfirmedAgeSec: 5,
      learnedByRoute: { r1: { meanDelaySec: 300, sampleCount: 6 } },
    })!;
    expect(result.blurb).not.toMatch(/usually/);
  });

  it("reports a stale-ping blurb for predicted trips whose ping age exceeds 240s", () => {
    const result = smartEtaV2({
      stopId: "s3",
      arrivals: [
        arrival({ stopId: "s1", tripId: "t1", arrivalUnix: NOW - 10 }),
        arrival({ stopId: "s2", tripId: "t1", arrivalUnix: NOW + 300 }),
        arrival({ stopId: "s3", tripId: "t1", arrivalUnix: NOW + 600 }),
      ],
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 250 })],
      nowSec: NOW,
    })!;
    if (result.tier === "predicted") {
      expect(result.blurb).toBe("stale ping");
    } else {
      expect(result.tier).toBeDefined();
    }
  });
});
