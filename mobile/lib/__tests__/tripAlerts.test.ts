import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Platform } from "react-native";
import { __resetNotifee, __notifee, TriggerType } from "../../test/stubs/notifee";
import { __resetHaptics, __hapticEvents } from "../../test/stubs/expo-haptics";

import { sendLocalTripAlert, scheduleTripAlert, cancelTripAlert } from "../tripAlerts";

const handBuilt = {
  id: "manual-1",
  title: "BUS 30 arrives in 3 min",
  body: "Head to Solomou.",
  data: { url: "/trip/abc" },
};

beforeEach(() => {
  __resetNotifee();
  __resetHaptics();
  Platform.OS = "android";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Platform.OS = "ios";
});

describe("sendLocalTripAlert", () => {
  it("creates the Android channel and displays the alert", async () => {
    await sendLocalTripAlert(handBuilt);
    const state = __notifee();
    expect(state.channels[0]).toMatchObject({ id: "trip-alerts", name: "Trip Alerts" });
    expect(state.displayed).toHaveLength(1);
    expect(state.displayed[0]).toMatchObject({
      id: "manual-1",
      title: "BUS 30 arrives in 3 min",
      data: { url: "/trip/abc" },
    });
    expect(state.displayed[0].android).toMatchObject({ channelId: "trip-alerts" });
  });

  it("fires a double heavy pulse", async () => {
    await sendLocalTripAlert(handBuilt);
    expect(__hapticEvents()).toEqual(["impact:heavy"]);
    await vi.advanceTimersByTimeAsync(200);
    expect(__hapticEvents()).toEqual(["impact:heavy", "impact:heavy"]);
  });

  it("skips the channel on iOS and still displays", async () => {
    Platform.OS = "ios";
    await sendLocalTripAlert(handBuilt);
    expect(__notifee().channels).toHaveLength(0);
    expect(__notifee().displayed[0].android).toMatchObject({ channelId: "default" });
  });

  it("is a no-op on web, where notifications come from the PWA", async () => {
    Platform.OS = "web";
    await sendLocalTripAlert(handBuilt);
    expect(__notifee().displayed).toHaveLength(0);
    expect(__hapticEvents()).toEqual([]);
  });

  it("builds copy from a journey-hook context when no title is supplied", async () => {
    await sendLocalTripAlert({
      kind: "board-soon",
      routeShort: "30",
      stopName: "Solomou",
      minutes: 4,
      url: "/trip/xyz",
    } as never);
    const shown = __notifee().displayed[0];
    expect(shown.id).toBeTruthy();
    expect(String(shown.title).length).toBeGreaterThan(0);
    expect(String(shown.body).length).toBeGreaterThan(0);
    expect(shown.data).toEqual({ url: "/trip/xyz" });
  });
});

describe("scheduleTripAlert", () => {
  it("schedules a timestamp trigger", async () => {
    const at = Date.now() + 300_000;
    await scheduleTripAlert({ ...handBuilt, triggerAt: at });
    const [entry] = __notifee().triggers;
    expect(entry.trigger).toEqual({ type: TriggerType.TIMESTAMP, timestamp: at });
    expect(entry.notification).toMatchObject({ id: "manual-1", title: handBuilt.title });
  });

  it("ignores alerts with no trigger time", async () => {
    await scheduleTripAlert(handBuilt);
    expect(__notifee().triggers).toHaveLength(0);
  });

  it("ignores scheduling on web", async () => {
    Platform.OS = "web";
    await scheduleTripAlert({ ...handBuilt, triggerAt: Date.now() + 1000 });
    expect(__notifee().triggers).toHaveLength(0);
  });
});

describe("cancelTripAlert", () => {
  it("cancels by id", async () => {
    await cancelTripAlert("manual-1");
    expect(__notifee().cancelled).toEqual(["manual-1"]);
  });

  it("does nothing on web", async () => {
    Platform.OS = "web";
    await cancelTripAlert("manual-1");
    expect(__notifee().cancelled).toEqual([]);
  });
});
