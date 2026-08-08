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

const patchActiveTripLiveMock = vi.fn();
vi.mock("../trip-store", () => ({
  patchActiveTripLive: (...args: unknown[]) => patchActiveTripLiveMock(...args),
}));

vi.mock("../pwa", () => ({
  getDeviceId: () => "device-1",
  getDeviceToken: vi.fn(async () => "device-token-1"),
  getAccessToken: vi.fn(async () => "access-token-1"),
}));

const detectWrongStopMock = vi.fn(() => null);
vi.mock("../wrong-stop-reroute", () => ({
  detectWrongStop: (...args: unknown[]) => detectWrongStopMock(...(args as [])),
}));

vi.mock("../gtfs", () => ({
  getStop: () => null,
}));

vi.mock("../shapes", () => ({
  getShapeForTripSync: () => null,
  prefetchShapes: vi.fn(),
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
vi.mock("../useDriveEta", () => ({
  useDriveEta: () => driveEta,
}));

vi.mock("@/hooks/use-tick", () => ({
  useTick: () => 0,
}));

const resolveLivePhaseMock = vi.fn();
const fuseVehicleAndEtaMock = vi.fn();
const alertForPhaseMock = vi.fn();
const vehicleBasedSecsToBoardMock = vi.fn(() => null);
const shouldAutoConfirmBoardingMock = vi.fn(() => ({ confirm: false, ridingSinceMs: null }));
vi.mock("@aloya/core/journey-live", () => ({
  resolveLivePhase: (...args: unknown[]) => resolveLivePhaseMock(...(args as [])),
  fuseVehicleAndEta: (...args: unknown[]) => fuseVehicleAndEtaMock(...(args as [])),
  alertForPhase: (...args: unknown[]) => alertForPhaseMock(...(args as [])),
  vehicleBasedSecsToBoard: (...args: unknown[]) => vehicleBasedSecsToBoardMock(...(args as [])),
  shouldAutoConfirmBoarding: (...args: unknown[]) => shouldAutoConfirmBoardingMock(...(args as [])),
}));

import {
  useJourney,
  startLiveTracking,
  confirmOnBoard,
  markMissed,
  markAlighted,
} from "../useJourney";
import type { ActiveTrip } from "../trip-store";
import type { WalkStep } from "../geo";

function makeActive(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
  return {
    startedAt: 1000,
    option: {
      id: "opt1",
      totalDurationSec: 600,
      departureUnix: 1700000000,
      arrivalUnix: 1700000600,
      legs: [
        {
          kind: "walk",
          from: { lat: 1, lng: 1, label: "home" },
          to: { lat: 1.001, lng: 1.001, label: "board-stop" },
          durationSec: 120,
          distanceMeters: 150,
        },
        {
          kind: "bus",
          routeId: "R1",
          routeShort: "1",
          routeLong: "Route 1",
          tripId: "T1",
          board: { stopId: "S1", name: "Board Stop", departureUnix: 1700000100 },
          alight: { stopId: "S2", name: "Alight Stop", arrivalUnix: 1700000500 },
          delaySec: 0,
        },
        {
          kind: "walk",
          from: { lat: 1.01, lng: 1.01, label: "alight-stop" },
          to: { lat: 1.02, lng: 1.02, label: "dest" },
          durationSec: 90,
          distanceMeters: 100,
        },
      ],
    } as ActiveTrip["option"],
    from: { lat: 1, lng: 1, label: "home" },
    to: { lat: 1.02, lng: 1.02, label: "dest" },
    live: { startedAt: 1000 },
    ...overrides,
  };
}

const walkingSteps: WalkStep[] = [
  { start: { lat: 1, lng: 1 }, end: { lat: 1.001, lng: 1.001 } } as WalkStep,
];

function renderJourney(opts: {
  active: ActiveTrip | null;
  walkingSteps?: WalkStep[] | null;
  walkingPhase?: "to-stop" | "to-dest" | null;
}) {
  return renderHook(
    (props: { active: ActiveTrip | null }) =>
      useJourney({
        active: props.active,
        walkingSteps: opts.walkingSteps ?? null,
        walkingPhase: opts.walkingPhase ?? null,
      }),
    { initialProps: { active: opts.active } },
  );
}

describe("useJourney", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeData = { arrivals: [], vehicles: [], ghostTripIds: [] };
    realtimeStale = false;
    fusedFix = null;
    driveEta = { etaSec: null, distanceMeters: null, fetchedAt: null };
    resolveLivePhaseMock.mockReturnValue({
      phase: "walking-to-stop",
      onBoardSuggested: false,
      missedSuggested: false,
    });
    fuseVehicleAndEtaMock.mockReturnValue({
      fusedVehicle: null,
      vehicleLost: false,
      fusedSecsToAlight: 100,
    });
    alertForPhaseMock.mockReturnValue(null);
  });

  it("returns the inactive baseline when there is no active trip", () => {
    const { result } = renderJourney({ active: null });
    expect(result.current.active).toBe(false);
    expect(result.current.phase).toBe("idle");
  });

  it("returns the inactive baseline when live tracking has not started", () => {
    const active = makeActive({ live: undefined });
    const { result } = renderJourney({ active });
    expect(result.current.active).toBe(false);
  });

  it("returns the inactive baseline when there is no bus leg", () => {
    const active = makeActive({
      option: {
        id: "opt2",
        totalDurationSec: 100,
        departureUnix: 1,
        arrivalUnix: 2,
        legs: [
          {
            kind: "walk",
            from: { lat: 1, lng: 1, label: "a" },
            to: { lat: 1, lng: 1, label: "b" },
            durationSec: 1,
            distanceMeters: 1,
          },
        ],
      } as ActiveTrip["option"],
    });
    const { result } = renderJourney({ active });
    expect(result.current.active).toBe(false);
  });

  it("produces an active result once started, computing secsToBoard/secsToAlight from schedule", () => {
    const active = makeActive();
    const { result } = renderJourney({ active, walkingSteps, walkingPhase: "to-stop" });
    expect(result.current.active).toBe(true);
    expect(resolveLivePhaseMock).toHaveBeenCalled();
    expect(result.current.phase).toBe("walking-to-stop");
  });

  it("prefers live arrival times over scheduled ones", () => {
    realtimeData = {
      arrivals: [
        { tripId: "T1", stopId: "S1", arrivalUnix: 9999999999 },
        { tripId: "T1", stopId: "S2", arrivalUnix: 9999999999 },
      ],
      vehicles: [],
      ghostTripIds: [],
    };
    const active = makeActive();
    renderJourney({ active });
    const call = resolveLivePhaseMock.mock.calls[0][0];
    expect(call.secsToBoard).toBeGreaterThan(1000000);
  });

  it("computes walking projection fields when fix + destination + steps are present", () => {
    fusedFix = {
      lat: 1,
      lng: 1,
      uncertaintyM: 5,
      speedMps: 1,
      bearingDeg: 0,
      timestamp: Date.now(),
    };
    const active = makeActive();
    const { result } = renderJourney({ active, walkingSteps, walkingPhase: "to-stop" });
    expect(result.current.fix).toEqual({
      lat: 1,
      lng: 1,
      accuracyM: 5,
      speedMps: 1,
      headingDeg: 0,
      timestamp: fusedFix!.timestamp,
    });
  });

  it("falls back to straight-line walking projection without steps", () => {
    fusedFix = {
      lat: 1,
      lng: 1,
      uncertaintyM: 5,
      speedMps: 1,
      bearingDeg: 0,
      timestamp: Date.now(),
    };
    const active = makeActive();
    const { result } = renderJourney({ active, walkingSteps: [], walkingPhase: "to-stop" });
    expect(result.current.metersToDestination).toBeGreaterThan(0);
  });

  it("applies the vehicle-position ETA floor when it exceeds schedule + 60s", () => {
    realtimeData = {
      arrivals: [],
      vehicles: [{ tripId: "T1", lat: 1, lng: 1 }],
      ghostTripIds: [],
    };
    vehicleBasedSecsToBoardMock.mockReturnValue(999999 as never);
    const active = makeActive();
    renderJourney({ active });
    const call = resolveLivePhaseMock.mock.calls[0][0];
    expect(call.secsToBoard).toBe(999999);
  });

  it("skips the ETA floor once on board or alighted", () => {
    realtimeData = {
      arrivals: [],
      vehicles: [{ tripId: "T1", lat: 1, lng: 1 }],
      ghostTripIds: [],
    };
    vehicleBasedSecsToBoardMock.mockReturnValue(999999 as never);
    const active = makeActive({ live: { startedAt: 1000, onBoardConfirmedAt: 2000 } });
    renderJourney({ active });
    expect(vehicleBasedSecsToBoardMock).not.toHaveBeenCalled();
  });

  it("fuses vehicle + GPS ETA once on board", () => {
    const active = makeActive({ live: { startedAt: 1000, onBoardConfirmedAt: 2000 } });
    renderJourney({ active });
    expect(fuseVehicleAndEtaMock).toHaveBeenCalled();
  });

  it("does not fuse when not on board", () => {
    const active = makeActive();
    const { result } = renderJourney({ active });
    expect(fuseVehicleAndEtaMock).not.toHaveBeenCalled();
    expect(result.current.fusedVehicle).toBeNull();
  });

  it("flags vehicleNotTracked when feed is healthy but no vehicle exists yet", () => {
    realtimeData = { arrivals: [], vehicles: [], ghostTripIds: [] };
    const active = makeActive();
    const { result } = renderJourney({ active });
    expect(result.current.vehicleNotTracked).toBe(true);
  });

  it("does not flag vehicleNotTracked when the feed is stale", () => {
    realtimeStale = true;
    const active = makeActive();
    const { result } = renderJourney({ active });
    expect(result.current.vehicleNotTracked).toBe(false);
    expect(result.current.feedStale).toBe(true);
  });

  it("flags tripGhost when the tripId is in ghostTripIds", () => {
    realtimeData = { arrivals: [], vehicles: [], ghostTripIds: ["T1"] };
    const active = makeActive();
    const { result } = renderJourney({ active });
    expect(result.current.tripGhost).toBe(true);
  });

  it("requests a reroute hint while walking/at-stop with a fix", () => {
    fusedFix = {
      lat: 1,
      lng: 1,
      uncertaintyM: 5,
      speedMps: 1,
      bearingDeg: 0,
      timestamp: Date.now(),
    };
    resolveLivePhaseMock.mockReturnValue({
      phase: "at-stop",
      onBoardSuggested: false,
      missedSuggested: false,
    });
    const active = makeActive();
    renderJourney({ active });
    expect(detectWrongStopMock).toHaveBeenCalled();
  });

  it("does not request a reroute hint outside the pre-board phases", () => {
    fusedFix = {
      lat: 1,
      lng: 1,
      uncertaintyM: 5,
      speedMps: 1,
      bearingDeg: 0,
      timestamp: Date.now(),
    };
    resolveLivePhaseMock.mockReturnValue({
      phase: "on-bus",
      onBoardSuggested: false,
      missedSuggested: false,
    });
    const active = makeActive();
    renderJourney({ active });
    expect(detectWrongStopMock).not.toHaveBeenCalled();
  });

  it("auto-confirms boarding when the GPS heuristic says to", async () => {
    shouldAutoConfirmBoardingMock.mockReturnValue({ confirm: true, ridingSinceMs: 123 } as never);
    const active = makeActive();
    renderJourney({ active });
    await waitFor(() =>
      expect(patchActiveTripLiveMock).toHaveBeenCalledWith({
        onBoardConfirmedAt: expect.any(Number),
      }),
    );
  });

  it("resets the riding-since ref once on-board/missed/alighted is already set", () => {
    const active = makeActive({ live: { startedAt: 1000, onBoardConfirmedAt: 2000 } });
    renderJourney({ active });
    expect(shouldAutoConfirmBoardingMock).not.toHaveBeenCalled();
  });

  it("sends a push alert once per alert key and skips duplicates", async () => {
    alertForPhaseMock.mockReturnValue({ key: "k1", kind: "hurry", recordsHistory: false });
    const active = makeActive();
    const { rerender } = renderJourney({ active });
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalledTimes(1));
    rerender({ active });
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalledTimes(1));
  });

  it("swallows push alert failures", async () => {
    sendAlertMock.mockRejectedValueOnce(new Error("push failed"));
    alertForPhaseMock.mockReturnValue({ key: "k2", kind: "hurry", recordsHistory: false });
    const active = makeActive();
    renderJourney({ active });
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalled());
  });

  it("records trip history for arrival-style alerts", async () => {
    vi.doMock("../suggestions.functions", () => ({
      recordTripHistory: vi.fn().mockResolvedValue(undefined),
    }));
    alertForPhaseMock.mockReturnValue({ key: "k3", kind: "arrived", recordsHistory: true });
    const active = makeActive();
    renderJourney({ active });
    await waitFor(() => expect(sendAlertMock).toHaveBeenCalled());
  });

  it("does nothing on the alert effect when inactive", () => {
    renderJourney({ active: null });
    expect(sendAlertMock).not.toHaveBeenCalled();
  });

  it("cleans up GPS/feed subscriptions and stops firing on unmount", () => {
    const active = makeActive();
    const { unmount } = renderJourney({ active });
    expect(() => unmount()).not.toThrow();
  });

  it("action helpers patch the active trip's live state", () => {
    startLiveTracking();
    confirmOnBoard();
    markMissed();
    markAlighted();
    expect(patchActiveTripLiveMock).toHaveBeenCalledWith({ startedAt: expect.any(Number) });
    expect(patchActiveTripLiveMock).toHaveBeenCalledWith({
      onBoardConfirmedAt: expect.any(Number),
    });
    expect(patchActiveTripLiveMock).toHaveBeenCalledWith({ missedAt: expect.any(Number) });
    expect(patchActiveTripLiveMock).toHaveBeenCalledWith({ alightedAt: expect.any(Number) });
  });
});
