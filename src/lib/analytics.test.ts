// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const logTrainingEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/training.functions", () => ({
  logTrainingEvent: (arg: unknown) => logTrainingEvent(arg),
}));

const getDeviceId = vi.fn(() => "device-1");
vi.mock("@/lib/pwa", () => ({
  getDeviceId: () => getDeviceId(),
}));

import { track, trackImpression } from "./analytics";

describe("track", () => {
  beforeEach(() => {
    logTrainingEvent.mockClear().mockResolvedValue(undefined);
    getDeviceId.mockClear().mockReturnValue("device-1");
  });

  it("logs a training event with the device id, kind and payload", () => {
    track("ui:nl-planner.impression", { confidence: 0.8 });
    expect(logTrainingEvent).toHaveBeenCalledWith({
      data: {
        deviceId: "device-1",
        kind: "ui:nl-planner.impression",
        payload: { confidence: 0.8 },
      },
    });
  });

  it("defaults to an empty payload", () => {
    track("ai:nl-planner.parsed");
    expect(logTrainingEvent).toHaveBeenCalledWith({
      data: { deviceId: "device-1", kind: "ai:nl-planner.parsed", payload: {} },
    });
  });

  it("swallows a synchronous error from getDeviceId", () => {
    getDeviceId.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => track("ui:x.y")).not.toThrow();
    expect(logTrainingEvent).not.toHaveBeenCalled();
  });

  it("swallows a rejected logTrainingEvent promise", async () => {
    logTrainingEvent.mockReturnValue(Promise.reject(new Error("network fail")));
    expect(() => track("ui:x.y")).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe("trackImpression", () => {
  beforeEach(() => {
    logTrainingEvent.mockClear().mockResolvedValue(undefined);
    getDeviceId.mockClear().mockReturnValue("device-1");
  });

  it("tracks the first impression for a given key", () => {
    trackImpression("ui:card.impression", { id: 1 }, "card-1");
    expect(logTrainingEvent).toHaveBeenCalledTimes(1);
  });

  it("dedupes subsequent impressions with the same key", () => {
    trackImpression("ui:card.impression", {}, "card-2");
    trackImpression("ui:card.impression", {}, "card-2");
    trackImpression("ui:card.impression", {}, "card-2");
    expect(logTrainingEvent).toHaveBeenCalledTimes(1);
  });

  it("uses the event name as the dedupe key when none is provided", () => {
    trackImpression("ui:no-key.impression");
    trackImpression("ui:no-key.impression");
    expect(logTrainingEvent).toHaveBeenCalledTimes(1);
  });

  it("treats different keys as distinct impressions", () => {
    trackImpression("ui:card.impression", {}, "card-3a");
    trackImpression("ui:card.impression", {}, "card-3b");
    expect(logTrainingEvent).toHaveBeenCalledTimes(2);
  });
});
