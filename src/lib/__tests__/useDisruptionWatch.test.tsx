// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDisruptionWatch } from "../useDisruptionWatch";
import type { MultiLegLive } from "../useMultiLegJourney";
import type { ActiveTrip } from "../trip-store";
import type { RideLeg } from "../itinerary-types";

function makeRide(overrides: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "R1",
    routeShort: "1",
    routeLong: "Route 1",
    tripId: "T1",
    live: true,
    board: {
      stopId: "S1",
      name: "Board",
      lat: 1,
      lng: 1,
      departureUnix: Math.floor(Date.now() / 1000) + 1000,
    },
    alight: {
      stopId: "S2",
      name: "Alight",
      lat: 2,
      lng: 2,
      arrivalUnix: Math.floor(Date.now() / 1000) + 2000,
    },
    stopCount: 3,
    delaySec: 0,
    ...overrides,
  };
}

function makeActive(): ActiveTrip {
  return {
    startedAt: 1,
    option: { id: "o1" } as ActiveTrip["option"],
    from: { lat: 1, lng: 1, label: "home" },
    to: { lat: 2, lng: 2, label: "dest" },
  };
}

function makeLive(overrides: Partial<MultiLegLive> = {}): MultiLegLive {
  return {
    active: true,
    fix: null,
    phase: "riding",
    currentLegIndex: 1,
    currentLeg: null,
    nextLeg: null,
    currentRideLeg: makeRide(),
    nextRideLeg: null,
    rideOrdinal: 1,
    totalRides: 1,
    secsToCurrentBoard: 0,
    secsToCurrentAlight: 0,
    secsToNextBoard: 0,
    nextBoardSource: "scheduled",
    nextBoardLate: false,
    metersToTarget: 0,
    fusedCurrentVehicle: null,
    vehicleLost: false,
    feedStale: false,
    tripGhost: false,
    nextVehicleTracked: false,
    rerouteHint: null,
    ...overrides,
  };
}

describe("useDisruptionWatch", () => {
  it("returns null when there is no active trip", () => {
    const { result } = renderHook(() => useDisruptionWatch(null, makeLive()));
    expect(result.current).toBeNull();
  });

  it("returns null when the journey is inactive", () => {
    const { result } = renderHook(() =>
      useDisruptionWatch(makeActive(), makeLive({ active: false })),
    );
    expect(result.current).toBeNull();
  });

  it("flags missed-connection with the highest priority", () => {
    const live = makeLive({
      phase: "missed-connection",
      nextRideLeg: makeRide({ routeShort: "9" }),
      vehicleLost: true,
      feedStale: true,
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("missed-connection");
    expect(result.current?.suggestReplan).toBe(true);
    expect(result.current?.body).toContain("9");
  });

  it("flags vehicle-lost-feed while on board with both feed and GPS gone", () => {
    const live = makeLive({ phase: "riding", vehicleLost: true, feedStale: true });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("vehicle-lost-feed");
    expect(result.current?.suggestReplan).toBe(false);
  });

  it("does not flag vehicle-lost-feed if only one of feed/GPS failed", () => {
    const live = makeLive({ phase: "riding", vehicleLost: true, feedStale: false });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current).toBeNull();
  });

  it("flags ghost-pre-board while walking to a ghost trip within the horizon", () => {
    const live = makeLive({
      phase: "walking-to-board",
      currentRideLeg: makeRide(),
      tripGhost: true,
      secsToCurrentBoard: 300,
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("ghost-pre-board");
    expect(result.current?.suggestReplan).toBe(true);
  });

  it("ignores ghost-pre-board outside the pre-board horizon", () => {
    const live = makeLive({
      phase: "walking-to-board",
      currentRideLeg: makeRide(),
      tripGhost: true,
      secsToCurrentBoard: 60 * 60,
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current).toBeNull();
  });

  it("flags late-pre-board when the bus is slipping before boarding", () => {
    const now = Math.floor(Date.now() / 1000);
    const live = makeLive({
      phase: "waiting-to-board",
      currentRideLeg: makeRide({
        board: { stopId: "S1", name: "Board", lat: 1, lng: 1, departureUnix: now + 60 },
      }),
      secsToCurrentBoard: 600, // slip of 540s > 8min threshold... adjust
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("late-pre-board");
    expect(result.current?.suggestReplan).toBe(true);
  });

  it("flags connection-at-risk when walking to a transfer with a tight window", () => {
    const live = makeLive({
      phase: "walking-to-transfer",
      currentRideLeg: null,
      nextRideLeg: makeRide({ routeShort: "5" }),
      secsToNextBoard: 30,
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("connection-at-risk");
    expect(result.current?.suggestReplan).toBe(false);
  });

  it("does not flag connection-at-risk while waiting (not walking-to-transfer)", () => {
    const live = makeLive({
      phase: "waiting-for-connection",
      nextRideLeg: makeRide(),
      secsToNextBoard: 30,
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current).toBeNull();
  });

  it("flags running-late when the current ride is behind the planned alight time", () => {
    const now = Math.floor(Date.now() / 1000);
    const live = makeLive({
      phase: "riding",
      currentRideLeg: makeRide({
        alight: { stopId: "S2", name: "Alight", lat: 2, lng: 2, arrivalUnix: now },
      }),
      secsToCurrentAlight: 10 * 60, // arriving 10 min after plan
      nextRideLeg: makeRide({ routeShort: "7" }),
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("running-late");
    expect(result.current?.suggestReplan).toBe(true);
  });

  it("suggests no replan for running-late without a downstream connection", () => {
    const now = Math.floor(Date.now() / 1000);
    const live = makeLive({
      phase: "alight-soon",
      currentRideLeg: makeRide({
        alight: { stopId: "S2", name: "Alight", lat: 2, lng: 2, arrivalUnix: now },
      }),
      secsToCurrentAlight: 10 * 60,
      nextRideLeg: null,
    });
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), live));
    expect(result.current?.kind).toBe("running-late");
    expect(result.current?.suggestReplan).toBe(false);
  });

  it("returns null when nothing is wrong", () => {
    const { result } = renderHook(() => useDisruptionWatch(makeActive(), makeLive()));
    expect(result.current).toBeNull();
  });

  it("memoises the result across re-renders with identical inputs", () => {
    const active = makeActive();
    const live = makeLive({ phase: "missed-connection", nextRideLeg: makeRide() });
    const { result, rerender } = renderHook(
      ({ a, l }: { a: ActiveTrip; l: MultiLegLive }) => useDisruptionWatch(a, l),
      { initialProps: { a: active, l: live } },
    );
    const first = result.current;
    rerender({ a: active, l: live });
    expect(result.current).toBe(first);
  });
});
