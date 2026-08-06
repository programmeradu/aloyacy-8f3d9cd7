// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getDeviceId } from "./device-id";

const KEY = "aloya:device_id";

describe("getDeviceId", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("generates and persists a new id when none is stored", () => {
    const id = getDeviceId();
    expect(id).toBeTruthy();
    expect(window.localStorage.getItem(KEY)).toBe(id);
  });

  it("returns the same id across calls", () => {
    const a = getDeviceId();
    const b = getDeviceId();
    expect(a).toBe(b);
  });

  it("reuses an existing stored id instead of generating a new one", () => {
    window.localStorage.setItem(KEY, "existing-id");
    expect(getDeviceId()).toBe("existing-id");
  });

  it("falls back to a non-crypto id when randomUUID is unavailable", () => {
    const original = crypto.randomUUID;
    // @ts-expect-error -- simulate an environment without randomUUID
    crypto.randomUUID = undefined;
    try {
      const id = getDeviceId();
      expect(id).toMatch(/^dev_/);
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("returns 'unknown' when localStorage access throws", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(getDeviceId()).toBe("unknown");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns 'server' when window is undefined", () => {
    const originalWindow = global.window;
    // @ts-expect-error -- simulate SSR
    delete global.window;
    try {
      expect(getDeviceId()).toBe("server");
    } finally {
      global.window = originalWindow;
    }
  });
});
