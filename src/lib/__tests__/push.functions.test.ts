import { describe, expect, it, beforeEach, vi } from "vitest";
import { callServerFn } from "./server-fn";
import { makeSupabaseMock, type TableResult } from "./supabase-mock";

const state: { push_subscriptions: TableResult } = {
  push_subscriptions: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client.server", () => {
  const { client } = makeSupabaseMock({
    push_subscriptions: () => state.push_subscriptions,
  });
  return { supabaseAdmin: client };
});

const sendWebPush = vi.fn();
vi.mock("./webpush.server", () => ({
  sendWebPush: (...args: unknown[]) => sendWebPush(...args),
}));

const { saveSubscription, removeSubscription, sendTestPush, sendTripAlert } = await import(
  "../push.functions"
);

const sub = {
  endpoint: "https://push.example.com/abc",
  p256dh: "abc123_-XYZ",
  auth: "def456_-XYZ",
};

describe("saveSubscription", () => {
  beforeEach(() => {
    state.push_subscriptions = { data: null, error: null };
  });

  it("rejects an invalid subscription at the validator boundary", async () => {
    await expect(
      callServerFn(saveSubscription, {
        deviceId: "short",
        subscription: sub,
      } as never),
    ).rejects.toThrow();
  });

  it("saves a valid subscription", async () => {
    const out = await callServerFn(saveSubscription, {
      deviceId: "device-12345",
      subscription: sub,
    });
    expect(out).toEqual({ ok: true });
  });

  it("throws a friendly error when the upsert fails", async () => {
    state.push_subscriptions = { data: null, error: { message: "db down" } };
    await expect(
      callServerFn(saveSubscription, { deviceId: "device-12345", subscription: sub }),
    ).rejects.toThrow("Could not save subscription");
  });
});

describe("removeSubscription", () => {
  beforeEach(() => {
    state.push_subscriptions = { data: null, error: null };
  });

  it("rejects a non-url endpoint", async () => {
    await expect(callServerFn(removeSubscription, { endpoint: "not-a-url" })).rejects.toThrow();
  });

  it("returns ok even when the delete errors (best effort)", async () => {
    state.push_subscriptions = { data: null, error: { message: "boom" } };
    const out = await callServerFn(removeSubscription, { endpoint: sub.endpoint });
    expect(out).toEqual({ ok: true });
  });

  it("removes a subscription", async () => {
    const out = await callServerFn(removeSubscription, { endpoint: sub.endpoint });
    expect(out).toEqual({ ok: true });
  });
});

describe("sendTestPush / dispatchToDevice", () => {
  beforeEach(() => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    state.push_subscriptions = { data: [], error: null };
    sendWebPush.mockReset();
  });

  it("throws when VAPID_PRIVATE_KEY is not configured", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await expect(callServerFn(sendTestPush, { deviceId: "device-12345" })).rejects.toThrow(
      "VAPID_PRIVATE_KEY is not configured",
    );
  });

  it("returns zero counts when there are no subscriptions", async () => {
    const out = await callServerFn(sendTestPush, { deviceId: "device-12345" });
    expect(out).toEqual({ sent: 0, expired: 0 });
  });

  it("throws when the subscription lookup errors", async () => {
    state.push_subscriptions = { data: null, error: { message: "lookup failed" } };
    await expect(callServerFn(sendTestPush, { deviceId: "device-12345" })).rejects.toThrow(
      "lookup failed",
    );
  });

  it("counts a successful send", async () => {
    state.push_subscriptions = {
      data: [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
      error: null,
    };
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });
    const out = await callServerFn(sendTestPush, { deviceId: "device-12345" });
    expect(out).toEqual({ sent: 1, expired: 0, error: null });
  });

  it("counts an expired subscription and deletes it", async () => {
    state.push_subscriptions = {
      data: [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
      error: null,
    };
    sendWebPush.mockResolvedValue({ ok: false, status: 410, expired: true });
    const out = await callServerFn(sendTestPush, { deviceId: "device-12345" });
    expect(out).toEqual({ sent: 0, expired: 1, error: null });
  });

  it("records the last provider error without expiring the subscription", async () => {
    state.push_subscriptions = {
      data: [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
      error: null,
    };
    sendWebPush.mockResolvedValue({ ok: false, status: 500, error: "provider down" });
    const out = await callServerFn(sendTestPush, { deviceId: "device-12345" });
    expect(out.sent).toBe(0);
    expect(out.expired).toBe(0);
    expect(out.error).toContain("provider down");
  });

  it("returns immediately with a misconfiguration error when sendWebPush throws one", async () => {
    state.push_subscriptions = {
      data: [
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { endpoint: "https://push.example.com/second", p256dh: sub.p256dh, auth: sub.auth },
      ],
      error: null,
    };
    sendWebPush.mockRejectedValue(new Error("Push notifications are misconfigured: bad keys"));
    const out = await callServerFn(sendTestPush, { deviceId: "device-12345" });
    expect(out.error).toContain("misconfigured");
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });
});

describe("sendTripAlert", () => {
  beforeEach(() => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
    state.push_subscriptions = { data: [], error: null };
    sendWebPush.mockReset();
  });

  it("rejects an unknown alert kind at the validator boundary", async () => {
    await expect(
      callServerFn(sendTripAlert, { deviceId: "device-12345", kind: "not-a-kind" } as never),
    ).rejects.toThrow();
  });

  it("builds the board-soon copy with route + stop + minutes", async () => {
    state.push_subscriptions = {
      data: [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
      error: null,
    };
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });
    await callServerFn(sendTripAlert, {
      deviceId: "device-12345",
      kind: "board-soon",
      routeShort: "30",
      stopName: "Makarios Ave",
      minutes: 4,
    });
    const payload = sendWebPush.mock.calls[0][0].payload;
    expect(payload.title).toBe("BUS 30 arrives in 4 min");
    expect(payload.body).toBe("Head to Makarios Ave.");
    expect(payload.tag).toBe("aloya-board-soon");
  });

  it("falls back to defaults when route/stop/minutes are absent", async () => {
    state.push_subscriptions = {
      data: [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
      error: null,
    };
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });
    await callServerFn(sendTripAlert, { deviceId: "device-12345", kind: "arrived" });
    const payload = sendWebPush.mock.calls[0][0].payload;
    expect(payload.title).toBe("You have arrived");
    expect(payload.requireInteraction).toBeUndefined();
  });

  it("marks urgent kinds as requiring interaction", async () => {
    state.push_subscriptions = {
      data: [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }],
      error: null,
    };
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });
    await callServerFn(sendTripAlert, { deviceId: "device-12345", kind: "hurry-urgent", minutes: 1 });
    const payload = sendWebPush.mock.calls[0][0].payload;
    expect(payload.requireInteraction).toBe(true);
  });
});
