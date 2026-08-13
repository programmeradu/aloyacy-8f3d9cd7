// @vitest-environment jsdom
//
// Out-of-band error capture. The server entry reads this to recover a real

// stack after the HTTP layer has already flattened the throw into a generic
// 500, so the contract is: one-shot read, and never resurrect a stale error
// against an unrelated later request.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Module = typeof import("./error-capture");

async function freshModule(): Promise<Module> {
  vi.resetModules();
  return (await import("./error-capture")) as Module;
}

function dispatchError(error: unknown) {
  const event = new Event("error") as Event & { error?: unknown };
  event.error = error;
  globalThis.dispatchEvent(event);
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("consumeLastCapturedError", () => {
  it("returns undefined when nothing has been captured", async () => {
    const mod = await freshModule();
    expect(mod.consumeLastCapturedError()).toBeUndefined();
  });

  it("returns the most recent error once, then clears it", async () => {
    const mod = await freshModule();
    const boom = new Error("boom");
    dispatchError(boom);
    expect(mod.consumeLastCapturedError()).toBe(boom);
    expect(mod.consumeLastCapturedError()).toBeUndefined();
  });

  it("keeps only the latest error when several land in one request", async () => {
    const mod = await freshModule();
    dispatchError(new Error("first"));
    const last = new Error("last");
    dispatchError(last);
    expect(mod.consumeLastCapturedError()).toBe(last);
  });

  it("captures unhandled promise rejections too", async () => {
    const mod = await freshModule();
    const reason = new Error("rejected");
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    event.reason = reason;
    globalThis.dispatchEvent(event);
    expect(mod.consumeLastCapturedError()).toBe(reason);
  });

  it("falls back to the event itself when no Error object is attached", async () => {
    const mod = await freshModule();
    const event = new Event("error");
    globalThis.dispatchEvent(event);
    expect(mod.consumeLastCapturedError()).toBe(event);
  });

  it("drops an error older than the five-second window", async () => {
    const mod = await freshModule();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    dispatchError(new Error("stale"));
    vi.setSystemTime(new Date("2026-01-01T00:00:06Z"));
    expect(mod.consumeLastCapturedError()).toBeUndefined();
    // ...and the drop is permanent, not a one-off skip.
    expect(mod.consumeLastCapturedError()).toBeUndefined();
  });
});
