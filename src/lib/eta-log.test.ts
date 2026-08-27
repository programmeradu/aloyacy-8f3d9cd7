import { afterEach, describe, expect, it, vi } from "vitest";
import { _resetEtaLogSampler, sampleEtaPrediction } from "./eta-log";

const row = {
  tripId: "t1",
  routeId: "r1",
  stopId: "s1",
  horizonSec: 240,
  p50Sec: 240,
  p25Sec: 180,
  p90Sec: 360,
  tier: "live",
  confidence: "high",
  operatorEtaSec: 300,
  learnedBiasSec: 12,
  surface: "stop-card" as const,
};

describe("sampleEtaPrediction", () => {
  afterEach(() => {
    _resetEtaLogSampler();
    vi.unstubAllGlobals();
  });

  it("posts once per trip+stop per 60 s", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    sampleEtaPrediction(row);
    sampleEtaPrediction(row);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when fetch is missing", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => sampleEtaPrediction(row)).not.toThrow();
  });
});
