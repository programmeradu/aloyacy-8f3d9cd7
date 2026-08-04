import { describe, it, expect, vi } from "vitest";

// Stub GTFS static stop lookups so the module never touches the bundled
// dataset — tests fully control which stops "exist" and where they are.
vi.mock("./gtfs", () => {
  const stops: Record<string, { lat: number; lng: number }> = {
    A: { lat: 35.0, lng: 33.0 },
    B: { lat: 35.01, lng: 33.0 }, // ~1.1km north of A
    C: { lat: 35.02, lng: 33.0 }, // ~1.1km north of B
    D: { lat: 35.03, lng: 33.0 },
    E: { lat: 35.04, lng: 33.0 },
    F: { lat: 35.05, lng: 33.0 },
    G: { lat: 35.06, lng: 33.0 },
  };
  return {
    getStop: vi.fn((id: string) => stops[id] ?? null),
  };
});

import { smartEtaV2, type SmartEtaV2Input } from "./eta-v2";
import type { LiveArrival, LiveVehicle } from "./gtfs-rt.server";

const NOW = 1_700_000_000;

function arrival(overrides: Partial<LiveArrival>): LiveArrival {
  return {
    stopId: "B",
    routeId: "R1",
    tripId: "T1",
    arrivalUnix: NOW + 300,
    delaySec: 0,
    ...overrides,
  };
}

function vehicle(overrides: Partial<LiveVehicle>): LiveVehicle {
  return {
    id: "V1",
    routeId: "R1",
    tripId: "T1",
    lat: 35.0,
    lng: 33.0,
    bearing: 0,
    speed: 10,
    label: "1",
    timestamp: NOW,
    ...overrides,
  };
}

describe("smartEtaV2 — no arrivals", () => {
  it("returns null when there is no matching arrival for the stop", () => {
    const out = smartEtaV2({ stopId: "B", arrivals: [], vehicles: [], nowSec: NOW });
    expect(out).toBeNull();
  });

  it("returns null when arrivals exist for a different stop only", () => {
    const out = smartEtaV2({
      stopId: "B",
      arrivals: [arrival({ stopId: "C" })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(out).toBeNull();
  });

  it("ignores arrivals more than 30s in the past", () => {
    const out = smartEtaV2({
      stopId: "B",
      arrivals: [arrival({ arrivalUnix: NOW - 31 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(out).toBeNull();
  });

  it("still accepts an arrival exactly 30s in the past (boundary)", () => {
    const out = smartEtaV2({
      stopId: "B",
      arrivals: [arrival({ arrivalUnix: NOW - 30 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(out).not.toBeNull();
  });
});

describe("smartEtaV2 — operator fallback path (no usable geometry)", () => {
  it("falls back to the operator's ETA when the target stop is unknown to GTFS", () => {
    const out = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(out).not.toBeNull();
    expect(out!.etaSec).toBe(300);
    expect(out!.etaMin).toBe(5);
    expect(out!.lowerSec).toBe(out!.upperSec);
    expect(out!.stopsAway).toBe(0);
    expect(out!.operatorEtaMin).toBe(5);
    expect(out!.band).toBe("≈5 min");
  });

  it("falls back when the trip has fewer than two known stop vertices", () => {
    const out = smartEtaV2({
      stopId: "A",
      arrivals: [arrival({ stopId: "A", arrivalUnix: NOW + 120 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(out).not.toBeNull();
    expect(out!.etaSec).toBe(120);
    expect(out!.tier).toBe("scheduled");
    expect(out!.freshness).toBe("scheduled");
    expect(out!.blurb).toBe("scheduled");
  });

  it("clamps a negative operator ETA (bus already due) to zero", () => {
    const out = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW - 10 })],
      vehicles: [],
      nowSec: NOW,
    });
    expect(out!.etaSec).toBe(0);
    expect(out!.etaMin).toBe(0);
  });

  it("applies the weighted learned bias on the fallback path", () => {
    const base = smartEtaV2({
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
      learnedByRoute: { R1: { meanDelaySec: 100, sampleCount: 10 } },
    })!;
    expect(withBias.learnedBiasSec).toBe(100);
    // LEARNED_BIAS_WEIGHT = 0.6
    expect(withBias.etaSec).toBe(base.etaSec + 60);
  });

  it("ignores a learned bias below the minimum sample threshold", () => {
    const out = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [],
      nowSec: NOW,
      learnedByRoute: { R1: { meanDelaySec: 500, sampleCount: 2 } },
    })!;
    expect(out.learnedBiasSec).toBe(0);
    expect(out.etaSec).toBe(300);
  });

  it("marks the fallback path live when a fresh vehicle exists", () => {
    const out = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 300 })],
      vehicles: [vehicle({ timestamp: NOW - 5 })],
      nowSec: NOW,
    })!;
    expect(out.tier).toBe("live");
    expect(out.freshness).toBe("live");
  });
});

describe("smartEtaV2 — chord snapping (no shape)", () => {
  function tripArrivals(): LiveArrival[] {
    return [
      arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
      arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
      arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
    ];
  }

  it("computes a distance-based ETA to a downstream stop using chord geometry", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals: tripArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    });
    expect(out).not.toBeNull();
    expect(out!.stopsAway).toBeGreaterThan(0);
    expect(out!.etaSec).toBeGreaterThan(0);
    // Roughly ~2.2km at fallback urban speed (5 m/s) plus a dwell ⇒ well
    // under an hour but more than a couple of minutes.
    expect(out!.etaSec).toBeLessThan(3600);
  });

  it("returns a wider min/max band label when samples are sparse", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals: tripArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    expect(out.band).toMatch(/–| min/);
    expect(out.upperSec).toBeGreaterThanOrEqual(out.etaSec);
    expect(out.lowerSec).toBeLessThanOrEqual(out.etaSec);
  });

  it("prefers a well-sampled segment speed over the fallback speed", () => {
    const withoutStats = smartEtaV2({
      stopId: "C",
      arrivals: tripArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    // A much faster learned segment speed should shrink the ETA.
    const withStats = smartEtaV2({
      stopId: "C",
      arrivals: tripArrivals(),
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      segments: {
        "R1|A|B": { meanMps: 30, sampleCount: 20 },
        "R1|B|C": { meanMps: 30, sampleCount: 20 },
      },
    })!;
    expect(withStats.etaSec).toBeLessThan(withoutStats.etaSec);
  });

  it("uses learned dwell time at intermediate stops instead of the fallback guess", () => {
    const arrivals: LiveArrival[] = [
      arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
      arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
      arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
      arrival({ stopId: "D", tripId: "T1", arrivalUnix: NOW + 300 }),
    ];
    const noDwellStats = smartEtaV2({
      stopId: "D",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    const bigDwell = smartEtaV2({
      stopId: "D",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      dwells: {
        "R1|B": { meanDwellSec: 500, sampleCount: 20 },
        "R1|C": { meanDwellSec: 500, sampleCount: 20 },
      },
    })!;
    expect(bigDwell.etaSec).toBeGreaterThan(noDwellStats.etaSec);
  });

  it("uses the vehicle's own reported speed for the partial first leg when unstat'd", () => {
    const arrivals = tripArrivals();
    const slow = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW, speed: 2 })],
      nowSec: NOW,
    })!;
    const fast = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW, speed: 20 })],
      nowSec: NOW,
    })!;
    expect(fast.etaSec).toBeLessThan(slow.etaSec);
  });

  it("falls back to vertex 0 when there is no vehicle at all (schedule-only trip)", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals: tripArrivals(),
      vehicles: [],
      nowSec: NOW,
    })!;
    expect(out).not.toBeNull();
    expect(out.tier === "ghost" || out.tier === "scheduled").toBe(true);
  });
});

describe("smartEtaV2 — shape mode", () => {
  // A perfectly straight shape overlapping the stop chord exactly, so the
  // along-track distances line up 1:1 with the chord version above.
  const shape = [
    { lat: 35.0, lng: 33.0 },
    { lat: 35.01, lng: 33.0 },
    { lat: 35.02, lng: 33.0 },
    { lat: 35.03, lng: 33.0 },
  ];

  it("snaps the bus onto the shape polyline and measures along-track distance", () => {
    const arrivals: LiveArrival[] = [
      arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
      arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
      arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
    ];
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.005, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      shape,
    })!;
    expect(out).not.toBeNull();
    expect(out.etaSec).toBeGreaterThan(0);
    expect(out.stopsAway).toBeGreaterThan(0);
  });

  it("treats a shape with fewer than two points as no shape (chord fallback)", () => {
    const arrivals: LiveArrival[] = [
      arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
      arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
      arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
    ];
    const withDegenerateShape = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      shape: [{ lat: 35.0, lng: 33.0 }],
    })!;
    const withoutShape = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    expect(withDegenerateShape.etaSec).toBeCloseTo(withoutShape.etaSec, 5);
  });

  it("puts the bus at the leg before the target when it has already passed the target on the shape", () => {
    const arrivals: LiveArrival[] = [
      arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 200 }),
      arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW - 20 }),
      arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 60 }),
    ];
    // Vehicle already past C along the shape.
    const out = smartEtaV2({
      stopId: "B",
      arrivals,
      vehicles: [vehicle({ lat: 35.03, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      shape,
    })!;
    expect(out).not.toBeNull();
    expect(out.stopsAway).toBe(0);
    expect(out.etaSec).toBe(0);
    expect(out.tier).toBe("live");
  });
});

describe("smartEtaV2 — confidence bands & freshness tiers", () => {
  const arrivals: LiveArrival[] = [
    arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
    arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
    arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
  ];

  it("widens the pessimistic band when segment sample coverage is low", () => {
    const sparse = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW, speed: 5 })],
      nowSec: NOW,
    })!;
    const wellSampled = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW, speed: 5 })],
      nowSec: NOW,
      segments: {
        "R1|A|B": { meanMps: 5, sampleCount: 50 },
        "R1|B|C": { meanMps: 5, sampleCount: 50 },
      },
    })!;
    // Same p50 (same speed), but tighter upper bound with more samples.
    expect(wellSampled.upperSec).toBeLessThan(sparse.upperSec);
  });

  it("widens the band further when the ping is stale", () => {
    const fresh = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    const stale = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 200 })],
      nowSec: NOW,
    })!;
    expect(stale.upperSec).toBeGreaterThan(fresh.upperSec);
  });

  it("collapses the band label to ≈N min when lower/upper round to the same minute", () => {
    const out = smartEtaV2({
      stopId: "unknown-stop",
      arrivals: [arrival({ stopId: "unknown-stop", arrivalUnix: NOW + 60 })],
      vehicles: [],
      nowSec: NOW,
    })!;
    expect(out.band).toBe("≈1 min");
  });

  it("classifies a bus far away with a fresh ping as predicted, not live", () => {
    const farArrivals: LiveArrival[] = [
      arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
      arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
      arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
      arrival({ stopId: "D", tripId: "T1", arrivalUnix: NOW + 400 }),
      arrival({ stopId: "E", tripId: "T1", arrivalUnix: NOW + 500 }),
      arrival({ stopId: "F", tripId: "T1", arrivalUnix: NOW + 600 }),
      arrival({ stopId: "G", tripId: "T1", arrivalUnix: NOW + 700 }),
    ];
    const out = smartEtaV2({
      stopId: "G",
      arrivals: farArrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
    })!;
    expect(out.stopsAway).toBeGreaterThan(5);
    expect(out.tier).toBe("predicted");
    expect(out.freshness).toBe("predicted");
  });

  it("demotes to ghost once the ping exceeds the urban ghost threshold (180s)", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 200 })],
      nowSec: NOW,
    })!;
    expect(out.tier).toBe("ghost");
    expect(out.freshness).toBe("scheduled");
    expect(out.blurb).toBe("no gps — using schedule");
  });

  it("uses relaxed Intercity thresholds via the agency field", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 120 })],
      nowSec: NOW,
      agency: "IC",
    })!;
    // 120s stale would be "ghost" for urban (>=180 no, but predicted since <180)
    // For IC, ghost threshold is 300s so this should not be ghost.
    expect(out.tier).not.toBe("ghost");
  });
});

describe("smartEtaV2 — rider-confirmed upgrades", () => {
  const arrivals: LiveArrival[] = [
    arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
    arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
    arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
  ];

  it("upgrades a ghost trip to rider-confirmed when a fresh rider sighting exists", () => {
    const ghost = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 200 })],
      nowSec: NOW,
    })!;
    expect(ghost.tier).toBe("ghost");

    const upgraded = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 200 })],
      nowSec: NOW,
      riderConfirmedAgeSec: 10,
    })!;
    expect(upgraded.tier).toBe("rider-confirmed");
    expect(upgraded.blurb).toBe("rider-confirmed");
    expect(upgraded.pingAgeSec).toBe(10);
  });

  it("upgrades even with zero vehicles in the feed, using the sighting as a synthetic ping", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [],
      nowSec: NOW,
      riderConfirmedAgeSec: 5,
    })!;
    expect(out.tier).toBe("rider-confirmed");
  });

  it("does not upgrade a sighting older than the ghost threshold", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [],
      nowSec: NOW,
      riderConfirmedAgeSec: 500,
    })!;
    expect(out.tier).not.toBe("rider-confirmed");
  });

  it("uses the minimum of real ping age and sighting age", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 500 })],
      nowSec: NOW,
      riderConfirmedAgeSec: 5,
    })!;
    expect(out.pingAgeSec).toBe(5);
    expect(out.tier).toBe("rider-confirmed");
  });
});

describe("smartEtaV2 — learned bias blurb", () => {
  const arrivals: LiveArrival[] = [
    arrival({ stopId: "A", tripId: "T1", arrivalUnix: NOW - 20 }),
    arrival({ stopId: "B", tripId: "T1", arrivalUnix: NOW + 90 }),
    arrival({ stopId: "C", tripId: "T1", arrivalUnix: NOW + 200 }),
  ];

  it("surfaces a 'usually N min late' blurb with a well-sampled positive bias", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      learnedByRoute: { R1: { meanDelaySec: 240, sampleCount: 10 } },
    })!;
    expect(out.blurb).toBe("usually 4 min late");
  });

  it("surfaces a 'usually N min early' blurb with a well-sampled negative bias", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      learnedByRoute: { R1: { meanDelaySec: -180, sampleCount: 10 } },
    })!;
    expect(out.blurb).toBe("usually 3 min early");
  });

  it("does not surface the learned blurb below LEARNED_BLURB_MIN_SAMPLES", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW })],
      nowSec: NOW,
      learnedByRoute: { R1: { meanDelaySec: 240, sampleCount: 6 } },
    })!;
    expect(out.blurb).not.toMatch(/usually/);
  });

  it("does not surface the learned blurb when the tier is ghost/scheduled", () => {
    const out = smartEtaV2({
      stopId: "C",
      arrivals,
      vehicles: [vehicle({ lat: 35.0, lng: 33.0, timestamp: NOW - 200 })],
      nowSec: NOW,
      learnedByRoute: { R1: { meanDelaySec: 240, sampleCount: 20 } },
    })!;
    expect(out.tier).toBe("ghost");
    expect(out.blurb).toBe("no gps — using schedule");
  });
});
