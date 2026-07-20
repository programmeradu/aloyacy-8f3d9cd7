import { describe, expect, it } from "vitest";
import type { Itinerary, Leg } from "./itinerary-types";
import {
  accessWalkMeters,
  egressWalk,
  itineraryTrafficPoints,
  msUntilReplan,
  parseSharedPlan,
  trafficPointsKey,
} from "./plan-signals";

const NOW = Date.UTC(2026, 7, 23, 6, 0) ;

function walk(meters: number, name = "Stop"): Leg {
  return {
    kind: "walk",
    from: { name, lat: 34.7, lng: 33.02 },
    to: { name: "Door", lat: 34.71, lng: 33.03 },
    durationSec: Math.round(meters / 1.3),
    distanceMeters: meters,
    verified: true,
  };
}

function ride(departureUnix = Math.floor(NOW / 1000) + 600): Leg {
  return {
    kind: "ride",
    routeId: "r1",
    routeShort: "30",
    routeLong: "Centre",
    tripId: "t1",
    live: true,
    board: { stopId: "a", name: "A", lat: 34.72, lng: 33.04, departureUnix },
    alight: { stopId: "b", name: "B", lat: 34.9, lng: 33.6, arrivalUnix: departureUnix + 1800 },
    stopCount: 8,
    delaySec: 0,
  };
}

function itin(legs: Leg[]): Itinerary {
  return {
    id: "i1",
    legs,
    departureUnix: Math.floor(NOW / 1000),
    arrivalUnix: Math.floor(NOW / 1000) + 3600,
    totalDurationSec: 3600,
    transfers: 0,
  } as Itinerary;
}

describe("parseSharedPlan", () => {
  const full =
    "?fromLat=34.68&fromLng=33.04&fromLabel=Limassol&toLat=34.92&toLng=33.62&toLabel=Larnaca&dep=" +
    (Math.floor(NOW / 1000) + 900);

  it("hydrates both ends and a future departure", () => {
    const plan = parseSharedPlan(full, NOW);
    expect(plan?.origin?.label).toBe("Limassol");
    expect(plan?.destination.lat).toBe(34.92);
    expect(plan?.leaveByISO).toBe(new Date((Math.floor(NOW / 1000) + 900) * 1000).toISOString());
    expect(plan?.focus).toBeNull();
  });

  it("ignores a departure that has already passed", () => {
    const stale = full.replace(/dep=\d+/, `dep=${Math.floor(NOW / 1000) - 7200}`);
    expect(parseSharedPlan(stale, NOW)?.leaveByISO).toBeNull();
  });

  it("keeps a departure that only just passed", () => {
    const justGone = full.replace(/dep=\d+/, `dep=${Math.floor(NOW / 1000) - 30}`);
    expect(parseSharedPlan(justGone, NOW)?.leaveByISO).not.toBeNull();
  });

  it("focuses the origin field for destination-only links", () => {
    const plan = parseSharedPlan("?toLat=34.92&toLng=33.62&toLabel=Larnaca&dep=99999999999", NOW);
    expect(plan?.origin).toBeNull();
    expect(plan?.focus).toBe("from");
    expect(plan?.leaveByISO).toBeNull();
  });

  it("returns null without a usable destination", () => {
    expect(parseSharedPlan("", NOW)).toBeNull();
    expect(parseSharedPlan("?fromLat=34.6&fromLng=33&fromLabel=X", NOW)).toBeNull();
    expect(parseSharedPlan("?toLat=abc&toLng=33.6&toLabel=Larnaca", NOW)).toBeNull();
    expect(parseSharedPlan("?toLat=34.9&toLng=33.6&toLabel=%20%20", NOW)).toBeNull();
  });

  it("rejects out-of-range coordinates instead of planning to nowhere", () => {
    expect(parseSharedPlan("?toLat=99&toLng=33.6&toLabel=Larnaca", NOW)).toBeNull();
  });

  it("accepts a search string without the leading question mark", () => {
    expect(parseSharedPlan("toLat=34.92&toLng=33.62&toLabel=Larnaca", NOW)?.destination.label).toBe(
      "Larnaca",
    );
  });
});

describe("accessWalkMeters", () => {
  it("rounds the first walk", () => {
    expect(accessWalkMeters(itin([walk(412.4), ride()]))).toBe(412);
  });
  it("is zero when the ride starts at the door", () => {
    expect(accessWalkMeters(itin([ride()]))).toBe(0);
  });
  it("is null without an itinerary", () => {
    expect(accessWalkMeters(null)).toBeNull();
  });
});

describe("egressWalk", () => {
  it("returns the last walk after a ride", () => {
    const e = egressWalk(itin([walk(300), ride(), walk(1240, "Alight")]));
    expect(e?.walkMeters).toBe(1240);
    expect(e?.alight.name).toBe("Alight");
  });

  it("ignores a walk-only itinerary — there is no bus to hand off from", () => {
    expect(egressWalk(itin([walk(900)]))).toBeNull();
  });

  it("is null when the trip ends on the bus", () => {
    expect(egressWalk(itin([walk(300), ride()]))?.walkMeters).toBe(300);
  });
});

describe("itineraryTrafficPoints", () => {
  it("samples both ends of every ride and walk", () => {
    const pts = itineraryTrafficPoints(itin([walk(300), ride()]));
    expect(pts).toHaveLength(4);
    expect(trafficPointsKey(pts)).toBe("34.700,33.020|34.710,33.030|34.720,33.040|34.900,33.600");
  });

  it("is empty without an itinerary", () => {
    expect(itineraryTrafficPoints(undefined)).toEqual([]);
    expect(trafficPointsKey([])).toBe("");
  });
});

describe("msUntilReplan", () => {
  it("schedules just after the scheduled departure", () => {
    expect(msUntilReplan(itin([ride(Math.floor(NOW / 1000) + 20)]), NOW)).toBe(25_000);
  });
  it("caps the wait so polling stays regular for later trips", () => {
    expect(msUntilReplan(itin([ride(Math.floor(NOW / 1000) + 9000)]), NOW)).toBe(60_000);
  });
  it("asks for an immediate re-plan once the bus has gone", () => {
    expect(msUntilReplan(itin([ride(Math.floor(NOW / 1000) - 5)]), NOW)).toBe(0);
  });
  it("is null for a walk-only itinerary", () => {
    expect(msUntilReplan(itin([walk(500)]), NOW)).toBeNull();
  });
});
