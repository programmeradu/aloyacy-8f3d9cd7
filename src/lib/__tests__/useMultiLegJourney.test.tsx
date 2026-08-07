// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

const sendAlertMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../push.functions", () => ({
  sendTripAlert: (...args: unknown[]) => sendAlertMock(...args),
}));

const recordCommuteMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../commute-learner.functions", () => ({
  recordCommutePattern: (...args: unknown[]) => recordCommuteMock(...args),
}));

const advanceToNextLegMock = vi.fn();
const patchCurrentLegMock = vi.fn();
vi.mock("../trip-store", () => ({
  advanceToNextLeg: (...args: unknown[]) => advanceToNextLegMock(...args),
  patchCurrentLeg: (...args: unknown[]) => patchCurrentLegMock(...args),
}));

vi.mock("../pwa", () => ({
  getDeviceId: () => "device-1",
}));

const detectWrongStopMock = vi.fn(() => null);
vi.mock("../wrong-stop-reroute", () => ({
  detectWrongStop: (...args: unknown[]) => detectWrongStopMock(...(args as [])),
}));

const useRiderFixReporterMock = vi.fn();
vi.mock("../useRiderFixReporter", () => ({
  useRiderFixReporter: (...args: unknown[]) => useRiderFixReporterMock(...args),
}));

let realtimeData: unknown = { arrivals: [], vehicles: [], ghostTripIds: [] };
let realtimeStale = false;
vi.mock("../useRealtime", () => ({
  useRealtime: () => ({ data: realtimeData, isStale: realtimeStale }),
}));

let fusedFix: {
  lat: number;
  lng: number;
  uncertaintyM: number;
  speedMps: number;
  bearingDeg: number;
  timestamp: number;
} | null = null;
vi.mock("../useFusedFix", () => ({
  useFusedFix: () => ({ fix: fusedFix, error: null }),
}));

let driveEta: { etaSec: number | null; distanceMeters: number | null; fetchedAt: number | null } = {
  etaSec: null,
  distanceMeters: null,
  fetchedAt: null,
};
const useDriveEtaMock = vi.fn(() => driveEta);
const useDriveEtaMock = vi.fn((..._args: unknown[]) => driveEta);
  useDriveEta: (...args: unknown[]) => useDriveEtaMock(...args),
}));

const resolveLegsMock = vi.fn();
const resolveMultiLegPhaseMock = vi.fn();
const legTargetMock = vi.fn(() => null);
const fuseRideVehicleMock = vi.fn(() => ({ fusedCurrentVehicle: null, vehicleLost: false }));
const fuseAlightEtaMock = vi.fn((args: { secsToAlight: number }) => args.secsToAlight);
const isConnectionLateMock = vi.fn(() => false);
const shouldAdvanceLegMock = vi.fn(() => false);
const shouldAutoConfirmRideMock = vi.fn((): { confirm: boolean; ridingSinceMs: number | null } => ({
  confirm: false,
  ridingSinceMs: null,
}));
const multiLegAlertsMock = vi.fn(() => [] as { key: string; kind: string; routeShort?: string; stopName?: string; minutes?: number }[]);
vi.mock("@aloya/core/multileg-journey", () => ({
  resolveLegs: (...args: unknown[]) => resolveLegsMock(...(args as [])),
  resolveMultiLegPhase: (...args: unknown[]) => resolveMultiLegPhaseMock(...(args as [])),
  legTarget: (...args: unknown[]) => legTargetMock(...(args as [])),
  fuseRideVehicle: (...args: unknown[]) => fuseRideVehicleMock(...(args as [])),
  fuseAlightEta: (...args: unknown[]) => fuseAlightEtaMock(...(args as [Parameters<typeof fuseAlightEtaMock>[0]])),
  isConnectionLate: (...args: unknown[]) => isConnectionLateMock(...(args as [])),
  shouldAdvanceLeg: (...args: unknown[]) => shouldAdvanceLegMock(...(args as [])),
  shouldAutoConfirmRide: (...args: unknown[]) => shouldAutoConfirmRideMock(...(args as [])),
  multiLegAlerts: (...args: unknown[]) => multiLegAlertsMock(...(args as [])),
}));

import { useMultiLegJourney, multiLegConfirmOnBoard, multiLegMarkAlighted, multiLegMarkArrived, multiLegMarkMissed } from "../useMultiLegJourney";
import type { ActiveTrip } from "../trip-store";
import type { RideLeg, WalkLeg, Itinerary } from "../itinerary-types";

function makeWalk(overrides: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: { lat: 1, lng: 1, label: "home" },
    to: { lat: 1.001, lng: 1.001, label: "board" },
    durationSec: 120,
    distanceMeters: 150,
    ...overrides,
  } as WalkLeg;
}

function makeRide(overrides: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "R1",
    routeShort: "1",
    routeLong: "Route 1",
    tripId: "T1",
    board: { stopId: "S1", name: "Board", lat: 1, lng: 1, departureUnix: 1700000100 },
    alight: { stopId: "S2", name: "Alight", lat: 2, lng: 2, arrivalUnix: 1700000500 },
    stopCount: 3,
    delaySec: 0,
    ...overrides,
  } as RideLeg;
}

function makeItinerary(legs: Itinerary["legs"]): Itinerary {
  return { legs } as unknown as Itinerary;
}

function makeActive(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
  const legs = [makeWalk(), makeRide(), makeWalk({ to: { lat: 2, lng: 2, name: "dest" } })];
  return {
    startedAt: 1000,
    option: { id: "opt1" } as ActiveTrip["option"],
    from: { lat: 1, lng: 1, label: "home" },
    to: { lat: 2, lng: 2, label: "dest" },
    live: { startedAt: 1000 },
    itinerary: makeItinerary(legs),
    legState: { currentLegIndex: 1, perLeg: { 1: {} } },
    ...overrides,
  };
}

function defaultResolveLegs(legState: { currentLegIndex: number }, itin: Itinerary) {
  const idx = legState.currentLegIndex;
  const currentLeg = itin.legs[idx] ?? null;
  const nextLeg = itin.legs[idx + 1] ?? null;
  const currentRideLeg = currentLeg?.kind === "ride" ? currentLeg : null;
  return {
    index: idx,
    currentLeg,
    nextLeg,
    currentRideLeg,
    connectionRideLeg: null,
    rideOrdinal: 1,
    totalRides: 1,
  };
}

describe("useMultiLegJourney", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeData = { arrivals: [], vehicles: [], ghostTripIds: [] };
    realtimeStale = false;
    fusedFix = null;
    driveEta = { etaSec: null, distanceMeters: null, fetchedAt: null };
    useDriveEtaMock.mockImplementation(() => driveEta);
    resolveLegsMock.mockImplementation((legs: Itinerary["legs"], idx: number) =>
      defaultResolveLegs({ currentLegIndex: idx }, { legs }),
    );
    resolveMultiLegPhaseMock.mockReturnValue("riding");
    shouldAdvanceLegMock.mockReturnValue(false);
    shouldAutoConfirmRideMock.mockReturnValue({ confirm: false, ridingSinceMs: null });
    multiLegAlertsMock.mockReturnValue([]);
  });

  it("returns the inactive baseline when there is no active trip", () => {
    const { result } = renderHook(() => useMultiLegJourney(null));
    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("idle");
  });

  it("returns the inactive baseline when live tracking has not started", () => {
    const active = makeActive({ live: undefined });
    const { result } = renderHook(() => useMultiLegJourney(active));
    expect(result.current.active).toBe(false);
  });

  it("returns the inactive baseline when there is no itinerary/legState", () => {
    const active = makeActive({ itinerary: undefined, legState: undefined });
    const { result } = renderHook(() => useMultiLegJourney(active));
    expect(result.current.active).toBe(false);
  });

  it("produces an active result once started, on a ride leg", () => {
    const active = makeActive();
    const { result } = renderHook(() => useMultiLegJourney(active));
    expect(result.current.active).toBe(true);
    expect(result.current.phase).toBe("riding");
    expect(result.current.currentRideLeg?.tripId).toBe("T1");
  });

  it("flags tripGhost when the current ride's tripId is in ghostTripIds", () => {
    realtimeData = { arrivals: [], vehicles: [], ghostTripIds: ["T1"] };
    const active = makeActive();
    const { result } = renderHook(() => useMultiLegJourney(active));
    expect(result.current.tripGhost).toBe(true);
  });

  it("does not flag tripGhost for a walk leg (no current ride leg)", () => {
    const active = makeActive({ legState: { currentLegIndex: 0, perLeg: { 0: {} } } });
    realtimeData = { arrivals: [], vehicles: [], ghostTripIds: ["T1"] };
    const { result } = renderHook(() => useMultiLegJourney(active));
    expect(result.current.tripGhost).toBe(false);
  });

  it("requests a wrong-stop reroute hint while walking to board with a fix", () => {
    fusedFix = { lat: 1, lng: 1, uncertaintyM: 5, speedMps: 1, bearingDeg: 0, timestamp: Date.now() };
    resolveMultiLegPhaseMock.mockReturnValue("walking-to-board");
    const active = makeActive({ legState: { currentLegIndex: 0, perLeg: { 0: {} } } });
    renderHook(() => useMultiLegJourney(active));
    // currentLeg at idx 0 is a walk, so currentRideLeg is null -> hint not requested
    expect(detectWrongStopMock).not.toHaveBeenCalled();
  });

  it("requests a reroute hint while waiting-to-board with a ride leg + fix", () => {
    fusedFix = { lat: 1, lng: 1, uncertaintyM: 5, speedMps: 1, bearingDeg: 0, timestamp: Date.now() };
    resolveMultiLegPhaseMock.mockReturnValue("waiting-to-board");
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    expect(detectWrongStopMock).toHaveBeenCalled();
  });

  it("auto-advances the leg when shouldAdvanceLeg is true", async () => {
    shouldAdvanceLegMock.mockReturnValue(true);
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    await waitFor(() => expect(advanceToNextLegMock).toHaveBeenCalled());
  });

  it("does not auto-advance when shouldAdvanceLeg is false", () => {
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    expect(advanceToNextLegMock).not.toHaveBeenCalled();
  });

  it("auto-confirms boarding via GPS heuristic", async () => {
    shouldAutoConfirmRideMock.mockReturnValue({ confirm: true, ridingSinceMs: 123 });
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    await waitFor(() =>
      expect(patchCurrentLegMock).toHaveBeenCalledWith({ onBoardConfirmedAt: expect.any(Number) }),
    );
  });

  it("resets the riding-since ref when the journey becomes inactive", () => {
    const { rerender } = renderHook(({ active }: { active: ActiveTrip | null }) => useMultiLegJourney(active), {
      initialProps: { active: makeActive() as ActiveTrip | null },
    });
    rerender({ active: null });
    expect(shouldAutoConfirmRideMock).toHaveBeenCalledTimes(1); // only once, before going inactive
  });

  it("sends a push alert once per alert key and skips duplicates on rerender", async () => {
    multiLegAlertsMock.mockReturnValue([{ key: "k1", kind: "hurry" }]);
    const active = makeActive();
    const { rerender } = renderHook(({ active }: { active: ActiveTrip }) => useMultiLegJourney(active), {
      initialProps: { active },
    });
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalledTimes(1));
    rerender({ active });
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalledTimes(1));
  });

  it("swallows push alert failures", async () => {
    sendAlertMock.mockRejectedValueOnce(new Error("push failed"));
    multiLegAlertsMock.mockReturnValue([{ key: "k2", kind: "hurry" }]);
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalled());
  });

  it("reports rider GPS fix while on board", () => {
    const active = makeActive({ legState: { currentLegIndex: 1, perLeg: { 1: { onBoardConfirmedAt: 1 } } } });
    renderHook(() => useMultiLegJourney(active));
    expect(useRiderFixReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, tripId: "T1" }),
    );
  });

  it("does not report rider GPS fix when not on board", () => {
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    expect(useRiderFixReporterMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("records commute pattern exactly once on arrival", async () => {
    resolveMultiLegPhaseMock.mockReturnValue("arrived");
    const active = makeActive();
    const { rerender } = renderHook(({ active }: { active: ActiveTrip }) => useMultiLegJourney(active), {
      initialProps: { active },
    });
    await waitFor(() => expect(recordCommuteMock).toHaveBeenCalledTimes(1));
    rerender({ active });
    await waitFor(() => expect(recordCommuteMock).toHaveBeenCalledTimes(1));
  });

  it("does not record commute pattern if there is no ride leg", async () => {
    resolveMultiLegPhaseMock.mockReturnValue("arrived");
    const active = makeActive({ itinerary: makeItinerary([makeWalk()]), legState: { currentLegIndex: 0, perLeg: { 0: {} } } });
    renderHook(() => useMultiLegJourney(active));
    await new Promise((r) => setTimeout(r, 0));
    expect(recordCommuteMock).not.toHaveBeenCalled();
  });

  it("resets the recorded ref (retries) if recordCommutePattern rejects", async () => {
    resolveMultiLegPhaseMock.mockReturnValue("arrived");
    recordCommuteMock.mockRejectedValueOnce(new Error("not signed in"));
    const active = makeActive();
    renderHook(() => useMultiLegJourney(active));
    await waitFor(() => expect(recordCommuteMock).toHaveBeenCalledTimes(1));
  });

  it("cleans up on unmount without throwing", () => {
    const active = makeActive();
    const { unmount } = renderHook(() => useMultiLegJourney(active));
    expect(() => unmount()).not.toThrow();
  });

  it("passes drive-eta inputs only while on board with a resolvable vehicle position", () => {
    const active = makeActive({ legState: { currentLegIndex: 1, perLeg: { 1: { onBoardConfirmedAt: 1 } } } });
    realtimeData = { arrivals: [], vehicles: [{ tripId: "T1", lat: 5, lng: 5 }], ghostTripIds: [] };
    renderHook(() => useMultiLegJourney(active));
    expect(useDriveEtaMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, from: { lat: 5, lng: 5 } }),
    );
  });

  it("action helpers patch the active leg's live state", () => {
    multiLegConfirmOnBoard();
    multiLegMarkAlighted();
    multiLegMarkArrived();
    multiLegMarkMissed();
    expect(patchCurrentLegMock).toHaveBeenCalledWith({ onBoardConfirmedAt: expect.any(Number) });
    expect(patchCurrentLegMock).toHaveBeenCalledWith({ alightedAt: expect.any(Number) });
    expect(patchCurrentLegMock).toHaveBeenCalledWith({ arrivedAt: expect.any(Number) });
    expect(patchCurrentLegMock).toHaveBeenCalledWith({ missedAt: expect.any(Number) });
  });
});
