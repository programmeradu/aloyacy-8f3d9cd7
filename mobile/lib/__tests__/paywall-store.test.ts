import { describe, it, expect, vi, beforeEach } from "vitest";
import { paywallStore } from "../paywall-store";

describe("paywallStore", () => {
  beforeEach(() => {
    if (paywallStore.isOpen()) paywallStore.close();
  });

  it("open()/close() are idempotent and notify subscribers only on change", () => {
    const fn = vi.fn();
    const unsub = paywallStore.subscribe(fn);
    paywallStore.open();
    paywallStore.open();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(paywallStore.isOpen()).toBe(true);
    paywallStore.close();
    paywallStore.close();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(paywallStore.isOpen()).toBe(false);
    unsub();
  });

  it("toggle() flips state and always notifies", () => {
    const fn = vi.fn();
    paywallStore.subscribe(fn);
    paywallStore.toggle();
    expect(paywallStore.isOpen()).toBe(true);
    paywallStore.toggle();
    expect(paywallStore.isOpen()).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe stops future notifications", () => {
    const fn = vi.fn();
    const unsub = paywallStore.subscribe(fn);
    unsub();
    paywallStore.open();
    expect(fn).not.toHaveBeenCalled();
  });
});
