// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const claimDeviceTokenMock = vi.fn();
vi.mock("../suggestions.functions", () => ({
  claimDeviceToken: (...args: unknown[]) => claimDeviceTokenMock(...args),
}));

const getSessionMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}));

import {
  shouldRegisterSW,
  registerServiceWorker,
  getDeviceId,
  getDeviceToken,
  getAccessToken,
  serializeSubscription,
  getOrCreatePushSubscription,
  unsubscribePush,
} from "../pwa";

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, hostname },
    writable: true,
    configurable: true,
  });
}

describe("pwa", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    setHostname("aloya.app");
    Object.defineProperty(window, "self", { value: window, configurable: true });
    Object.defineProperty(window, "top", { value: window, configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("shouldRegisterSW", () => {
    it("is false when serviceWorker is unsupported", () => {
      vi.stubGlobal("navigator", {});
      expect(shouldRegisterSW()).toBe(false);
    });

    it("is false inside an iframe (window.self !== window.top)", () => {
      vi.stubGlobal("navigator", { serviceWorker: {} });
      Object.defineProperty(window, "top", { value: {}, configurable: true });
      expect(shouldRegisterSW()).toBe(false);
    });

    it.each([
      ["id-preview--abc.lovable.app"],
      ["myapp.lovableproject.com"],
      ["myapp.lovable.dev"],
    ])("is false on preview host %s", (host) => {
      vi.stubGlobal("navigator", { serviceWorker: {} });
      setHostname(host);
      expect(shouldRegisterSW()).toBe(false);
    });

    it("is true on a normal production host with SW support, top-level frame", () => {
      vi.stubGlobal("navigator", { serviceWorker: {} });
      expect(shouldRegisterSW()).toBe(true);
    });
  });

  describe("registerServiceWorker", () => {
    it("registers the SW when shouldRegisterSW is true", async () => {
      const register = vi.fn().mockResolvedValue({ scope: "/" });
      vi.stubGlobal("navigator", { serviceWorker: { register } });
      const reg = await registerServiceWorker();
      expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(reg).toEqual({ scope: "/" });
    });

    it("returns null and warns when registration throws", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const register = vi.fn().mockRejectedValue(new Error("nope"));
      vi.stubGlobal("navigator", { serviceWorker: { register } });
      const reg = await registerServiceWorker();
      expect(reg).toBeNull();
      expect(warn).toHaveBeenCalled();
    });

    it("unregisters any existing SW and returns null when it should not register", async () => {
      const unregister = vi.fn();
      const getRegistrations = vi.fn().mockResolvedValue([{ unregister }, { unregister }]);
      vi.stubGlobal("navigator", { serviceWorker: { getRegistrations } });
      setHostname("id-preview--x.lovable.app");
      const reg = await registerServiceWorker();
      expect(reg).toBeNull();
      expect(unregister).toHaveBeenCalledTimes(2);
    });

    it("tolerates getRegistrations being unavailable", async () => {
      vi.stubGlobal("navigator", {});
      setHostname("id-preview--x.lovable.app");
      await expect(registerServiceWorker()).resolves.toBeNull();
    });
  });

  describe("device id / token", () => {
    it("generates and persists a device id on first call", () => {
      vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
      const id = getDeviceId();
      expect(id).toBe("uuid-1");
      expect(window.localStorage.getItem("aloya:device-id")).toBe("uuid-1");
    });

    it("reuses the cached device id on subsequent calls", () => {
      vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "uuid-2") });
      const first = getDeviceId();
      const second = getDeviceId();
      expect(first).toBe(second);
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    });

    it("returns the cached token without calling the network", async () => {
      window.localStorage.setItem("aloya:device-token", "cached-tok");
      const token = await getDeviceToken();
      expect(token).toBe("cached-tok");
      expect(claimDeviceTokenMock).not.toHaveBeenCalled();
    });

    it("claims and caches a new token when none is cached", async () => {
      vi.stubGlobal("crypto", { randomUUID: () => "uuid-3" });
      claimDeviceTokenMock.mockResolvedValue({ ok: true, token: "fresh-tok" });
      const token = await getDeviceToken();
      expect(token).toBe("fresh-tok");
      expect(window.localStorage.getItem("aloya:device-token")).toBe("fresh-tok");
    });

    it("returns null and does not cache when the claim is not ok", async () => {
      vi.stubGlobal("crypto", { randomUUID: () => "uuid-4" });
      claimDeviceTokenMock.mockResolvedValue({ ok: false });
      const token = await getDeviceToken();
      expect(token).toBeNull();
      expect(window.localStorage.getItem("aloya:device-token")).toBeNull();
    });

    it("returns null when the claim call rejects (offline)", async () => {
      vi.stubGlobal("crypto", { randomUUID: () => "uuid-5" });
      claimDeviceTokenMock.mockRejectedValue(new Error("offline"));
      const token = await getDeviceToken();
      expect(token).toBeNull();
    });

    it("dedupes concurrent calls into a single in-flight claim request", async () => {
      vi.stubGlobal("crypto", { randomUUID: () => "uuid-6" });
      let resolveClaim!: (v: { ok: true; token: string }) => void;
      claimDeviceTokenMock.mockReturnValue(
        new Promise((resolve) => {
          resolveClaim = resolve;
        }),
      );
      const p1 = getDeviceToken();
      const p2 = getDeviceToken();
      resolveClaim({ ok: true, token: "shared-tok" });
      const [a, b] = await Promise.all([p1, p2]);
      expect(a).toBe("shared-tok");
      expect(b).toBe("shared-tok");
      expect(claimDeviceTokenMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAccessToken", () => {
    it("returns the session access token when signed in", async () => {
      getSessionMock.mockResolvedValue({ data: { session: { access_token: "at-1" } } });
      await expect(getAccessToken()).resolves.toBe("at-1");
    });

    it("returns null when there is no session", async () => {
      getSessionMock.mockResolvedValue({ data: { session: null } });
      await expect(getAccessToken()).resolves.toBeNull();
    });

    it("returns null when supabase throws", async () => {
      getSessionMock.mockRejectedValue(new Error("network"));
      await expect(getAccessToken()).resolves.toBeNull();
    });
  });

  describe("serializeSubscription", () => {
    it("base64url-encodes the p256dh and auth keys", () => {
      const p256dhBytes = new Uint8Array([1, 2, 3, 251, 252]).buffer;
      const authBytes = new Uint8Array([9, 9]).buffer;
      const sub = {
        endpoint: "https://push.example/abc",
        getKey: (name: string) => (name === "p256dh" ? p256dhBytes : authBytes),
      } as unknown as PushSubscription;
      const result = serializeSubscription(sub);
      expect(result.endpoint).toBe("https://push.example/abc");
      expect(result.p256dh).not.toMatch(/[+/=]/);
      expect(result.auth).not.toMatch(/[+/=]/);
      expect(result.p256dh.length).toBeGreaterThan(0);
    });

    it("returns an empty string for a null key", () => {
      const sub = {
        endpoint: "e",
        getKey: () => null,
      } as unknown as PushSubscription;
      const result = serializeSubscription(sub);
      expect(result.p256dh).toBe("");
      expect(result.auth).toBe("");
    });
  });

  describe("getOrCreatePushSubscription", () => {
    it("fails when serviceWorker is unsupported", async () => {
      vi.stubGlobal("navigator", {});
      const result = await getOrCreatePushSubscription();
      expect(result).toEqual({
        ok: false,
        reason: "Service workers are not supported in this browser.",
      });
    });

    it("fails when PushManager is unsupported", async () => {
      vi.stubGlobal("navigator", { serviceWorker: {} });
      const result = await getOrCreatePushSubscription();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/not supported/);
    });

    it("fails with an install-app hint when shouldRegisterSW is false", async () => {
      vi.stubGlobal("navigator", { serviceWorker: {} });
      vi.stubGlobal("PushManager", function () {});
      setHostname("id-preview--x.lovable.app");
      const result = await getOrCreatePushSubscription();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/installed app/);
    });

    it("fails when no registration is available", async () => {
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(null),
          register: vi.fn().mockRejectedValue(new Error("no sw")),
        },
      });
      vi.stubGlobal("PushManager", function () {});
      const result = await getOrCreatePushSubscription();
      expect(result).toEqual({ ok: false, reason: "Service worker not available." });
    });

    it("fails when notification permission is denied", async () => {
      const getSubscription = vi.fn();
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue({
            pushManager: { getSubscription },
          }),
          ready: Promise.resolve(),
        },
      });
      vi.stubGlobal("PushManager", function () {});
      vi.stubGlobal("Notification", { permission: "denied", requestPermission: vi.fn() });
      const result = await getOrCreatePushSubscription();
      expect(result).toEqual({ ok: false, reason: "Permission denied." });
      expect(getSubscription).not.toHaveBeenCalled();
    });

    it("requests permission when default, and subscribes on grant", async () => {
      const newSub = {
        endpoint: "https://push.example/new",
        getKey: () => new Uint8Array([1]).buffer,
      };
      const getSubscription = vi.fn().mockResolvedValue(null);
      const subscribe = vi.fn().mockResolvedValue(newSub);
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue({
            pushManager: { getSubscription, subscribe },
          }),
          ready: Promise.resolve(),
        },
      });
      vi.stubGlobal("PushManager", function () {});
      const requestPermission = vi.fn().mockResolvedValue("granted");
      vi.stubGlobal("Notification", { permission: "default", requestPermission });
      const result = await getOrCreatePushSubscription();
      expect(requestPermission).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ userVisibleOnly: true }),
      );
      expect(result).toEqual({
        ok: true,
        subscription: { endpoint: "https://push.example/new", p256dh: "AQ", auth: "AQ" },
      });
    });

    it("reuses an existing subscription without calling subscribe again", async () => {
      const existingSub = {
        endpoint: "https://push.example/existing",
        getKey: () => null,
      };
      const subscribe = vi.fn();
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue({
            pushManager: { getSubscription: vi.fn().mockResolvedValue(existingSub), subscribe },
          }),
          ready: Promise.resolve(),
        },
      });
      vi.stubGlobal("PushManager", function () {});
      vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
      const result = await getOrCreatePushSubscription();
      expect(subscribe).not.toHaveBeenCalled();
      expect(result.ok).toBe(true);
    });
  });

  describe("unsubscribePush", () => {
    it("returns false when serviceWorker is unsupported", async () => {
      vi.stubGlobal("navigator", {});
      await expect(unsubscribePush()).resolves.toBe(false);
    });

    it("returns false when there is no active registration/subscription", async () => {
      vi.stubGlobal("navigator", {
        serviceWorker: { getRegistration: vi.fn().mockResolvedValue(null) },
      });
      await expect(unsubscribePush()).resolves.toBe(false);
    });

    it("unsubscribes and returns true when a subscription exists", async () => {
      const unsubscribe = vi.fn().mockResolvedValue(true);
      vi.stubGlobal("navigator", {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue({
            pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe }) },
          }),
        },
      });
      await expect(unsubscribePush()).resolves.toBe(true);
      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
