import { describe, it, expect, vi } from "vitest";

// Stub GTFS static stop lookups so the module never touches the bundled
// dataset — the fixture table is the only source of stop geometry.
vi.mock("./gtfs", async () => {
  const { STOPS } = await import("./__fixtures__/eta-v2");
  return { getStop: vi.fn((id: string) => STOPS[id] ?? null) };
});

import { smartEtaV2 } from "./eta-v2";
import type { LiveArrival } from "./gtfs-rt.server";
import { NOW, arrival, vehicle } from "./__fixtures__/eta-v2";
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
      arrival({ stopId: "H", tripId: "T1", arrivalUnix: NOW + 800 }),
    ];
    const out = smartEtaV2({
      stopId: "H",
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
