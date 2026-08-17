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
