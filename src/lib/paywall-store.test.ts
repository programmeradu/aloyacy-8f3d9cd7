// The paywall is a single global sheet: any surface can open it and every
// subscriber must agree on whether it is showing. These tests pin the
// dedupe (no redundant notifications) and unsubscribe behaviour that keep
// the sheet from re-rendering the whole app on every hover.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { paywallStore } from "./paywall-store";

beforeEach(() => {
  paywallStore.close();
});

describe("paywallStore", () => {
  it("starts closed", () => {
    expect(paywallStore.get()).toBe(false);
  });

  it("opens and closes", () => {
    paywallStore.open();
    expect(paywallStore.get()).toBe(true);
    paywallStore.close();
    expect(paywallStore.get()).toBe(false);
  });

  it("notifies subscribers on each state change", () => {
    const listener = vi.fn();
    const unsubscribe = paywallStore.subscribe(listener);
    paywallStore.open();
    paywallStore.close();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not notify when the state is already what was asked for", () => {
    const listener = vi.fn();
    const unsubscribe = paywallStore.subscribe(listener);
    paywallStore.open();
    paywallStore.open();
    expect(listener).toHaveBeenCalledTimes(1);
    paywallStore.close();
    paywallStore.close();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = paywallStore.subscribe(listener);
    unsubscribe();
    paywallStore.open();
    expect(listener).not.toHaveBeenCalled();
  });

  it("fans out to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = paywallStore.subscribe(a);
    const ub = paywallStore.subscribe(b);
    paywallStore.open();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });
});
