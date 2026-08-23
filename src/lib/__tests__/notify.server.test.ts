// Behaviour of the unified notification layer: audience resolution, duplicate
// collapsing, retry on transient failures, and cleanup of dead endpoints.

import { describe, it, expect, vi, beforeEach } from "vitest";

const sendWebPush = vi.fn();
const sendExpoPush = vi.fn();
const deletedEndpoints: string[] = [];
const deletedTokens: string[] = [];
const inserted: unknown[] = [];

let webSubsByDevice: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
let webSubsById: Array<{ endpoint: string; p256dh: string; auth: string }> = [];
let expoTokens: Array<{ expo_token: string }> = [];

vi.mock("@/lib/webpush.server", () => ({ sendWebPush: (...a: unknown[]) => sendWebPush(...a) }));
vi.mock("@/lib/expopush.server", () => ({ sendExpoPush: (...a: unknown[]) => sendExpoPush(...a) }));
vi.mock("@/lib/vapid", () => ({ VAPID_PUBLIC_KEY: "pub" }));

vi.mock("@/integrations/supabase/client.server", () => {
  const table = (name: string) => ({
    select: () => ({
      eq: (column: string) => {
        if (name === "expo_push_tokens") return Promise.resolve({ data: expoTokens });
        return Promise.resolve({ data: column === "device_id" ? webSubsByDevice : webSubsById });
      },
    }),
    delete: () => ({
      eq: (_c: string, value: string) => {
        if (name === "expo_push_tokens") deletedTokens.push(value);
        else deletedEndpoints.push(value);
        return Promise.resolve({ data: null });
      },
    }),
    insert: (row: unknown) => {
      inserted.push(row);
      return Promise.resolve({ data: null });
    },
  });
  return { supabaseAdmin: { from: (name: string) => table(name) } };
});

const { deliver } = await import("@/lib/notify.server");

const sub = (endpoint: string) => ({ endpoint, p256dh: "p", auth: "a" });
const message = {
  category: "arrival-promise" as const,
  title: "Leave now",
  body: "BUS 259 in 4 min",
  tag: "aloya-test",
  url: "/trips",
};

beforeEach(() => {
  vi.clearAllMocks();
  deletedEndpoints.length = 0;
  deletedTokens.length = 0;
  inserted.length = 0;
  webSubsByDevice = [];
  webSubsById = [];
  expoTokens = [];
  process.env.VAPID_PRIVATE_KEY = "priv";
  sendExpoPush.mockResolvedValue({ ok: 0, expiredTokens: [], errors: [] });
});

describe("deliver", () => {
  it("returns an empty receipt when the rider has no registered surface", async () => {
    const receipt = await deliver({ deviceId: "d1" }, message);
    expect(receipt.ok).toBe(false);
    expect(receipt.sent).toBe(0);
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it("sends one push per endpoint and reports the channel", async () => {
    webSubsByDevice = [sub("https://push/1"), sub("https://push/2")];
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });

    const receipt = await deliver({ deviceId: "d1" }, message);

    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(receipt.sent).toBe(2);
    expect(receipt.channels.web).toBe(2);
    expect(receipt.ok).toBe(true);
  });

  it("collapses an endpoint reachable through both device and subscription id", async () => {
    webSubsByDevice = [sub("https://push/1")];
    webSubsById = [sub("https://push/1")];
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });

    const receipt = await deliver({ deviceId: "d1", subscriptionId: "s1" }, message);

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(receipt.duplicates).toBe(1);
  });

  it("retries a transient failure once, then succeeds", async () => {
    webSubsByDevice = [sub("https://push/1")];
    sendWebPush
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 201 });

    const receipt = await deliver({ deviceId: "d1" }, message);

    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(receipt.sent).toBe(1);
    expect(deletedEndpoints).toEqual([]);
  });

  it("does not retry a gone endpoint, and prunes it", async () => {
    webSubsByDevice = [sub("https://push/gone")];
    sendWebPush.mockResolvedValue({ ok: false, status: 410, expired: true });

    const receipt = await deliver({ deviceId: "d1" }, message);

    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(deletedEndpoints).toEqual(["https://push/gone"]);
    expect(receipt.pruned).toBe(1);
    expect(receipt.failed).toBe(1);
    expect(receipt.ok).toBe(false);
  });

  it("delivers natively and prunes unregistered Expo tokens", async () => {
    expoTokens = [{ expo_token: "ExponentPushToken[a]" }, { expo_token: "ExponentPushToken[b]" }];
    sendExpoPush.mockResolvedValue({
      ok: 1,
      expiredTokens: ["ExponentPushToken[b]"],
      errors: ["DeviceNotRegistered"],
    });

    const receipt = await deliver({ expoDeviceId: "d1" }, message);

    expect(receipt.channels.native).toBe(1);
    expect(deletedTokens).toEqual(["ExponentPushToken[b]"]);
    expect(receipt.pruned).toBe(1);
  });

  it("maps the category onto an Android channel", async () => {
    expoTokens = [{ expo_token: "ExponentPushToken[a]" }];
    sendExpoPush.mockResolvedValue({ ok: 1, expiredTokens: [], errors: [] });

    await deliver({ deviceId: "d1" }, { ...message, category: "trip-alert" });

    expect(sendExpoPush.mock.calls[0][0][0].channelId).toBe("trip-alerts");
  });

  it("records the attempt in the delivery ledger", async () => {
    webSubsByDevice = [sub("https://push/1")];
    sendWebPush.mockResolvedValue({ ok: true, status: 201 });

    await deliver({ deviceId: "d1" }, message);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ category: "arrival-promise", sent: 1, device_id: "d1" });
  });

  it("stays silent on web when VAPID is not configured", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    webSubsByDevice = [sub("https://push/1")];

    const receipt = await deliver({ deviceId: "d1" }, message);

    expect(sendWebPush).not.toHaveBeenCalled();
    expect(receipt.sent).toBe(0);
  });
});
