// A planner engine that crashes must never be reported to the rider as
// "no route exists" — that is a confident claim we cannot back. These tests
// pin the distinction: engine failure throws (client retries), a genuinely
// empty corridor returns an empty itinerary list.
import { describe, it, expect, vi, beforeEach } from "vitest";

const liveMock = vi.fn();
const schedMock = vi.fn();

vi.mock("./journey-multileg.server", () => ({
  planMultiLegJourney: (...args: unknown[]) => liveMock(...args),
}));
vi.mock("./journey-scheduled.server", () => {
  class NoScheduleAvailableError extends Error {
    date: string;
    constructor(date: string) {
      super(`no schedule for ${date}`);
      this.date = date;
    }
  }
  return {
    planMultiLegScheduled: (...args: unknown[]) => schedMock(...args),
    localDateForUnix: () => "20260827",
    NoScheduleAvailableError,
  };
});
vi.mock("./overrides.server", () => ({ getSkippedTransferCount: async () => 0 }));
vi.mock("./planner-learning.server", () => ({
  loadPlannerLearningContext: async () => null,
  rescoreItineraryWithLearning: () => {},
}));

const from = { lat: 35.16, lng: 33.36, label: "A" };
const to = { lat: 34.854, lng: 33.549, label: "B" };

async function plan() {
  const mod = await import("./multileg.functions");
  // The server fn exposes its handler behind a callable wrapper in tests.
  return (mod.planMultiLeg as unknown as (a: { data: unknown }) => Promise<unknown>)({
    data: { from, to },
  });
}

describe("planner availability honesty", () => {
  beforeEach(() => {
    liveMock.mockReset();
    schedMock.mockReset();
  });

  it("throws planner_unavailable when every engine fails", async () => {
    liveMock.mockRejectedValue(new Error("boom"));
    schedMock.mockRejectedValue(new Error("boom"));
    await expect(plan()).rejects.toThrow(/planner_unavailable/);
  });

  it("throws when the surviving engine finds nothing and the other crashed", async () => {
    liveMock.mockRejectedValue(new Error("boom"));
    schedMock.mockResolvedValue({ itineraries: [], diagnostics: {} });
    await expect(plan()).rejects.toThrow(/planner_unavailable/);
  });

  it("returns an empty list when both engines answer with no service", async () => {
    liveMock.mockResolvedValue({ itineraries: [] });
    schedMock.mockResolvedValue({ itineraries: [], diagnostics: {} });
    const res = (await plan()) as { itineraries: unknown[] };
    expect(res.itineraries).toEqual([]);
  });
});
