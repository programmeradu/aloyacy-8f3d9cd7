// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PhaseLabel, PhaseHeadline, PhaseSub } from "./PhaseCopy";
import type { Itinerary } from "@/lib/itinerary-types";
import type { MultiLegLive } from "@/lib/useMultiLegJourney";

function mockItin(): Itinerary {
  return {
    id: "itin-1",
    departureUnix: 1787000000,
    arrivalUnix: 1787003600,
    totalDurationSec: 3600,
    transfers: 1,
    totalWalkMeters: 600,
    score: 1,
    legs: [],
    source: "live",
  };
}

function mockLive(overrides: Partial<MultiLegLive> = {}): MultiLegLive {
  return {
    active: true,
    fix: null,
    phase: "walking-to-board",
    currentLegIndex: 0,
    currentLeg: null,
    nextLeg: null,
    currentRideLeg: {
      kind: "ride",
      routeId: "r1",
      routeShort: "30",
      routeLong: "Port - Park",
      tripId: "t1",
      live: true,
      board: { stopId: "s1", name: "Port", lat: 34.7, lng: 33.0, departureUnix: 1787000600 },
      alight: { stopId: "s2", name: "Park", lat: 34.8, lng: 33.1, arrivalUnix: 1787002000 },
      stopCount: 8,
      delaySec: 0,
    },
    nextRideLeg: null,
    rideOrdinal: 1,
    totalRides: 2,
    secsToCurrentBoard: 600,
    secsToCurrentAlight: 2000,
    secsToNextBoard: 0,
    nextBoardSource: "live",
    nextBoardLate: false,
    metersToTarget: 200,
    fusedCurrentVehicle: null,
    vehicleLost: false,
    feedStale: false,
    tripGhost: false,
    nextVehicleTracked: true,
    rerouteHint: null,
    ...overrides,
  };
}

describe("PhaseCopy components", () => {
  afterEach(cleanup);

  it("renders PhaseLabel for walking-to-board", () => {
    render(<PhaseLabel live={mockLive()} itin={mockItin()} />);
    expect(screen.getByText(/walk/i)).toBeInTheDocument();
  });

  it("renders PhaseHeadline for riding phase with destination stop", () => {
    const live = mockLive({ phase: "riding", secsToCurrentAlight: 300 });
    render(<PhaseHeadline live={live} itin={mockItin()} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/at Park/i)).toBeInTheDocument();
  });

  it("renders PhaseHeadline for arrived phase", () => {
    const live = mockLive({ phase: "arrived" });
    render(<PhaseHeadline live={live} itin={mockItin()} />);
    expect(screen.getByText(/there/i)).toBeInTheDocument();
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
  });

  it("renders PhaseSub with walk guidance subtitle", () => {
    const live = mockLive({ phase: "walking-to-board", metersToTarget: 350 });
    render(<PhaseSub live={live} itin={mockItin()} destLabel="Park" />);
    expect(screen.getByText(/We'll watch the bus/i)).toBeInTheDocument();
  });
});
