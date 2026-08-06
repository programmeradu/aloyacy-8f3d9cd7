// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("../pwa", () => ({ getDeviceId: () => "device-1" }));
const logMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../training.functions", () => ({
  logTrainingEvent: (...args: unknown[]) => logMock(...args),
}));

import { useTrainingSignals } from "../useTrainingSignals";
import type { ActiveTrip } from "../trip-store";
import type { MultiLegLive } from "../useMultiLegJourney";
import type { RideLeg, WalkLeg, Itinerary } from "../itinerary-types";

function makeRide(overrides: Partial<RideLeg> = {}): RideLeg {
  return {
    kind: "ride",
    routeId: "R1",
    routeShort: "1",
    routeLong: "Route 1",
    tripId: "T1",
    board: { stopId: "S1", name: "Board", lat: 1, lng: 1, departureUnix: 1 },
    alight: { stopId: "S2", name: "Alight", lat: 2, lng: 2, arrivalUnix: 2 },
    stopCount: 1,
    delaySec: 0,
    ...overrides,
  } as RideLeg;
}
function makeWalk(overrides: Partial<WalkLeg> = {}): WalkLeg {
  return {
    kind: "walk",
    from: { lat: 1, lng: 1, label: "a" },
    to: { lat: 2, lng: 2, label: "b" },
    durationSec: 100,
    distanceMeters: 100,
    ...overrides,
  } as WalkLeg;
}

function makeActive(legs: Itinerary["legs"], perLeg: Record<number, Record<string, number>> = {}): ActiveTrip {
  return {
    startedAt: 1,
    option: { id: "opt1" } as ActiveTrip["option"],
    from: { lat: 1, lng: 1, label: "home" },
    to: { lat: 2, lng: 2, label: "dest" },
    itinerary: { legs } as Itinerary,
    legState: { currentLegIndex: legs.length - 1, perLeg },
  };
}

function makeLive(overrides: Partial<MultiLegLive> = {}): MultiLegLive {
  return {
    active: true,
    fix: null,
    phase: "riding",
    currentLegIndex: 0,
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

describe("useTrainingSignals", () => {
  beforeEach(() => {
    logMock.mockClear();
    logMock.mockResolvedValue(undefined);
  });

  it("does nothing when live is inactive", () => {
    const active = makeActive([makeRide()]);
    renderHook(() => useTrainingSignals(active, makeLive({ active: false })));
    expect(logMock).not.toHaveBeenCalled();
  });

  it("does nothing without an itinerary/legState", () => {
    renderHook(() => useTrainingSignals(null, makeLive()));
    expect(logMock).not.toHaveBeenCalled();
  });

  it("logs a phase-transition on rerender when the phase changes (skips the initial phase)", async () => {
    const active = makeActive([makeRide()], { 0: {} });
    const { rerender } = renderHook(
      ({ live }: { live: MultiLegLive }) => useTrainingSignals(active, live),
      { initialProps: { live: makeLive({ currentLegIndex: 0, phase: "riding" }) } },
    );
    expect(logMock).not.toHaveBeenCalled();
    rerender({ live: makeLive({ currentLegIndex: 0, phase: "alight-soon" }) });
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "phase-transition",
            payload: expect.objectContaining({ from: "riding", to: "alight-soon" }),
          }),
        }),
      ),
    );
  });

  it("fires boarding-prompt-shown exactly once while waiting-to-board", async () => {
    const active = makeActive([makeRide()], { 0: {} });
    const { rerender } = renderHook(
      ({ live }: { live: MultiLegLive }) => useTrainingSignals(active, live),
      { initialProps: { live: makeLive({ phase: "waiting-to-board", currentLegIndex: 0 }) } },
    );
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ kind: "boarding-prompt-shown" }) }),
      ),
    );
    const calls = logMock.mock.calls.length;
    rerender({ live: makeLive({ phase: "waiting-to-board", currentLegIndex: 0 }) });
    await new Promise((r) => setTimeout(r, 0));
    expect(logMock.mock.calls.length).toBe(calls);
  });

  it("fires boarding-prompt-confirmed once a ride leg gets onBoardConfirmedAt", async () => {
    const active = makeActive([makeRide()], { 0: { enteredAt: 1000, onBoardConfirmedAt: 1500 } });
    renderHook(() => useTrainingSignals(active, makeLive({ currentLegIndex: 0 })));
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "boarding-prompt-confirmed",
            payload: expect.objectContaining({ latencyMs: 500 }),
          }),
        }),
      ),
    );
  });

  it("flags a missed-bus false positive when confirmed within 4 minutes of missedAt", async () => {
    const missedAt = 1000;
    const active = makeActive([makeRide()], {
      0: { missedAt, onBoardConfirmedAt: missedAt + 60_000 },
    });
    renderHook(() => useTrainingSignals(active, makeLive({ currentLegIndex: 0 })));
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ kind: "missed-bus-false-positive" }) }),
      ),
    );
  });

  it("does not flag a false positive when the gap exceeds 4 minutes", async () => {
    const missedAt = 1000;
    const active = makeActive([makeRide()], {
      0: { missedAt, onBoardConfirmedAt: missedAt + 5 * 60_000 },
    });
    renderHook(() => useTrainingSignals(active, makeLive({ currentLegIndex: 0 })));
    await new Promise((r) => setTimeout(r, 0));
    expect(logMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "missed-bus-false-positive" }) }),
    );
  });

  it("logs walk-complete for a plausible walk duration", async () => {
    const legs = [makeWalk({ durationSec: 100 }), makeRide()];
    const active = makeActive(legs, { 0: { enteredAt: 0, completedAt: 90_000 } });
    renderHook(() => useTrainingSignals(active, makeLive({ currentLegIndex: 1 })));
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "walk-complete",
            payload: expect.objectContaining({ plannedSec: 100, actualSec: 90 }),
          }),
        }),
      ),
    );
  });

  it("skips walk-complete for implausible durations (too fast or too slow)", async () => {
    const legs = [makeWalk({ durationSec: 100 }), makeRide()];
    const active = makeActive(legs, { 0: { enteredAt: 0, completedAt: 1000 } }); // 1s -> too fast
    renderHook(() => useTrainingSignals(active, makeLive({ currentLegIndex: 1 })));
    await new Promise((r) => setTimeout(r, 0));
    expect(logMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: "walk-complete" }) }),
    );
  });

  it("logs transfer-made when boarding a ride leg after a previous ride leg", async () => {
    const legs = [makeRide({ routeShort: "1" }), makeWalk(), makeRide({ routeShort: "2" })];
    const active = makeActive(legs, { 2: { onBoardConfirmedAt: 1 } });
    renderHook(() => useTrainingSignals(active, makeLive({ currentLegIndex: 2 })));
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "transfer-made",
            payload: expect.objectContaining({ fromRoute: "1", toRoute: "2" }),
          }),
        }),
      ),
    );
  });

  it("logs transfer-missed on the missed-connection phase", async () => {
    const active = makeActive([makeRide()], { 0: {} });
    renderHook(() =>
      useTrainingSignals(
        active,
        makeLive({
          phase: "missed-connection",
          currentLegIndex: 0,
          currentRideLeg: makeRide({ routeShort: "1" }),
          nextRideLeg: makeRide({ routeShort: "2", tripId: "T2" }),
        }),
      ),
    );
    await waitFor(() =>
      expect(logMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "transfer-missed",
            payload: expect.objectContaining({ fromRoute: "1", toRoute: "2" }),
          }),
        }),
      ),
    );
  });

  it("swallows log failures without throwing", async () => {
    logMock.mockRejectedValueOnce(new Error("network down"));
    const active = makeActive([makeRide()], { 0: {} });
    expect(() =>
      renderHook(() => useTrainingSignals(active, makeLive({ phase: "waiting-to-board", currentLegIndex: 0 }))),
    ).not.toThrow();
    await waitFor(() => expect(logMock).toHaveBeenCalled());
  });
});
