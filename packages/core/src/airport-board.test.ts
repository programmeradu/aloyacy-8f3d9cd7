import { describe, it, expect } from "vitest";
import {
  selectAirportDepartures,
  hasGhostLead,
  feedStatusLabel,
  seatPressure,
  seatLabel,
  airportDisplayName,
  airportShareMessage,
  coordinateLine,
} from "./airport-board";

const NOW = 1_700_000_000;

function arr(tripId: string, offsetMin: number, stopId = "6117", routeId = "R1") {
  return { tripId, routeId, stopId, arrivalUnix: NOW + offsetMin * 60 };
}
const eta = (etaMin: number, tier = "live") => ({ etaMin, tier });

describe("selectAirportDepartures", () => {
  const etaFor = (a: { arrivalUnix: number }) => eta(Math.round((a.arrivalUnix - NOW) / 60));

  it("keeps only the requested stop, sorted by time", () => {
    const rows = selectAirportDepartures({
      arrivals: [arr("t2", 10), arr("x", 1, "999"), arr("t1", 4)],
      stopId: "6117",
      nowSec: NOW,
      etaFor,
    });
    expect(rows.map((r) => r.arrival.tripId)).toEqual(["t1", "t2"]);
  });

  it("dedupes repeated trips keeping the earliest arrival", () => {
    const rows = selectAirportDepartures({
      arrivals: [arr("t1", 20), arr("t1", 5)],
      stopId: "6117",
      nowSec: NOW,
      etaFor,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].eta.etaMin).toBe(5);
  });

  it("drops arrivals past the grace window", () => {
    const rows = selectAirportDepartures({
      arrivals: [arr("old", -5), arr("t1", 3)],
      stopId: "6117",
      nowSec: NOW,
      etaFor,
    });
    expect(rows.map((r) => r.arrival.tripId)).toEqual(["t1"]);
  });

  it("keeps an arrival inside the grace window", () => {
    const rows = selectAirportDepartures({
      arrivals: [{ ...arr("just", 0), arrivalUnix: NOW - 20 }],
      stopId: "6117",
      nowSec: NOW,
      etaFor,
    });
    expect(rows).toHaveLength(1);
  });

  it("drops rows beyond the horizon and rows without an eta", () => {
    const rows = selectAirportDepartures({
      arrivals: [arr("far", 400), arr("none", 5), arr("ok", 9)],
      stopId: "6117",
      nowSec: NOW,
      etaFor: (a) => (a.tripId === "none" ? null : etaFor(a)),
    });
    expect(rows.map((r) => r.arrival.tripId)).toEqual(["ok"]);
  });

  it("respects the limit", () => {
    const rows = selectAirportDepartures({
      arrivals: [arr("a", 1), arr("b", 2), arr("c", 3)],
      stopId: "6117",
      nowSec: NOW,
      etaFor,
      limit: 2,
    });
    expect(rows).toHaveLength(2);
  });

  it("returns nothing without a stop id or arrivals", () => {
    expect(
      selectAirportDepartures({ arrivals: [arr("a", 1)], stopId: "", nowSec: NOW, etaFor }),
    ).toEqual([]);
    expect(selectAirportDepartures({ arrivals: [], stopId: "6117", nowSec: NOW, etaFor })).toEqual(
      [],
    );
  });

  it("ignores non-finite etas", () => {
    const rows = selectAirportDepartures({
      arrivals: [arr("nan", 3)],
      stopId: "6117",
      nowSec: NOW,
      etaFor: () => eta(Number.NaN),
    });
    expect(rows).toEqual([]);
  });
});

describe("board chrome helpers", () => {
  it("detects a ghost lead row", () => {
    expect(hasGhostLead([{ eta: eta(4, "ghost") }])).toBe(true);
    expect(hasGhostLead([{ eta: eta(4) }, { eta: eta(9, "ghost") }])).toBe(false);
    expect(hasGhostLead([])).toBe(false);
  });

  it("labels feed status", () => {
    expect(feedStatusLabel({ stale: true, loading: true })).toBe("Feed stale");
    expect(feedStatusLabel({ loading: true })).toBe("Loading");
    expect(feedStatusLabel({})).toBe("Live · 15s");
    expect(feedStatusLabel({ intervalSec: 30 })).toBe("Live · 30s");
  });
});

describe("seat helpers", () => {
  it("classifies seat pressure", () => {
    expect(seatPressure(0)).toBe("sold");
    expect(seatPressure(-3)).toBe("sold");
    expect(seatPressure(8)).toBe("low");
    expect(seatPressure(20)).toBe("open");
  });

  it("labels seats with singular handling", () => {
    expect(seatLabel(0)).toBe("Sold out");
    expect(seatLabel(1)).toBe("1 seat");
    expect(seatLabel(12)).toBe("12 seats");
  });
});

describe("airport identity helpers", () => {
  it("falls back to a known airport name", () => {
    expect(airportDisplayName("lca")).toBe("Larnaca Airport");
    expect(airportDisplayName("pfo", "  ")).toBe("Paphos Airport");
    expect(airportDisplayName("xyz")).toBe("XYZ Airport");
    expect(airportDisplayName("lca", "Larnaka Intl")).toBe("Larnaka Intl");
  });

  it("builds a share message", () => {
    const s = airportShareMessage({ code: "LCA", name: "Larnaca Airport" });
    expect(s.url).toBe("https://app.aloya.cy/airport/lca");
    expect(s.title).toBe("Larnaca Airport · Aloya");
    expect(s.message).toContain("(LCA)");
    expect(airportShareMessage({ code: "pfo", name: "P", baseUrl: "https://x.dev/" }).url).toBe(
      "https://x.dev/airport/pfo",
    );
  });

  it("formats the coordinate line safely", () => {
    expect(coordinateLine(34.8751, 33.6249)).toBe("Airport service · 34.8751, 33.6249");
    expect(coordinateLine(null, 33)).toBe("Airport service");
    expect(coordinateLine(undefined, undefined)).toBe("Airport service");
  });
});
