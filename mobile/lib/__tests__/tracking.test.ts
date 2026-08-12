// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "react-native";
import { renderHook, waitFor } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { __resetStorage, __dumpStorage } from "../../test/stubs/async-storage";
import { ensureTrackingDecision, useTrackingDecision } from "../tracking";

const KEY = "aloya.att.decision.v1";

beforeEach(() => {
  __resetStorage();
  vi.doUnmock("expo-tracking-transparency");
});

afterEach(() => {
  Platform.OS = "ios";
  vi.doUnmock("expo-tracking-transparency");
});

describe("ensureTrackingDecision", () => {
  it("is unavailable on android and persists that decision, without touching the native module", async () => {
    Platform.OS = "android";
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "unavailable" });
    expect(__dumpStorage()[KEY]).toBe("unavailable");
  });

  it("is unavailable on web", async () => {
    Platform.OS = "web";
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "unavailable" });
  });

  it("falls back to unavailable on iOS when the native module can't be loaded (no throw)", async () => {
    Platform.OS = "ios";
    // expo-tracking-transparency isn't installed in this harness, so the
    // dynamic import genuinely rejects — exercising the real catch path.
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "unavailable" });
    expect(__dumpStorage()[KEY]).toBeUndefined();
  });

  it("returns granted immediately when already granted, without re-requesting", async () => {
    Platform.OS = "ios";
    const requestSpy = vi.fn();
    vi.doMock("expo-tracking-transparency", () => ({
      getTrackingPermissionsAsync: async () => ({ status: "granted", canAskAgain: false }),
      requestTrackingPermissionsAsync: requestSpy,
    }));
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "granted" });
    expect(requestSpy).not.toHaveBeenCalled();
    expect(__dumpStorage()[KEY]).toBe("granted");
  });

  it("returns denied without prompting again when denied and canAskAgain is false", async () => {
    Platform.OS = "ios";
    const requestSpy = vi.fn();
    vi.doMock("expo-tracking-transparency", () => ({
      getTrackingPermissionsAsync: async () => ({ status: "denied", canAskAgain: false }),
      requestTrackingPermissionsAsync: requestSpy,
    }));
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "denied" });
    expect(requestSpy).not.toHaveBeenCalled();
    expect(__dumpStorage()[KEY]).toBe("denied");
  });

  it("prompts and records granted when denied but canAskAgain is true and the user accepts", async () => {
    Platform.OS = "ios";
    vi.doMock("expo-tracking-transparency", () => ({
      getTrackingPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
      requestTrackingPermissionsAsync: async () => ({ status: "granted" }),
    }));
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "granted" });
    expect(__dumpStorage()[KEY]).toBe("granted");
  });

  it("prompts and records denied when the user declines the prompt", async () => {
    Platform.OS = "ios";
    vi.doMock("expo-tracking-transparency", () => ({
      getTrackingPermissionsAsync: async () => ({ status: "undetermined", canAskAgain: true }),
      requestTrackingPermissionsAsync: async () => ({ status: "denied" }),
    }));
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "denied" });
    expect(__dumpStorage()[KEY]).toBe("denied");
  });

  it("treats any non-granted request result as denied (e.g. restricted)", async () => {
    Platform.OS = "ios";
    vi.doMock("expo-tracking-transparency", () => ({
      getTrackingPermissionsAsync: async () => ({ status: "undetermined", canAskAgain: true }),
      requestTrackingPermissionsAsync: async () => ({ status: "restricted" }),
    }));
    const result = await ensureTrackingDecision();
    expect(result).toEqual({ status: "denied" });
  });
});

describe("useTrackingDecision", () => {
  it("starts unknown and stays unknown with no stored decision when autoPrompt is false", async () => {
    Platform.OS = "android";
    const { result } = renderHook(() => useTrackingDecision(false));
    expect(result.current).toEqual({ status: "unknown" });
    // Give the effect's microtask a tick; it should read storage, find
    // nothing, and — since autoPrompt is false — stop there.
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual({ status: "unknown" });
  });

  it("hydrates from a previously stored decision", async () => {
    await AsyncStorage.setItem(KEY, "granted");
    const { result } = renderHook(() => useTrackingDecision(false));
    await waitFor(() => expect(result.current).toEqual({ status: "granted" }));
  });

  it("hydrates a stored 'denied' decision", async () => {
    await AsyncStorage.setItem(KEY, "denied");
    const { result } = renderHook(() => useTrackingDecision(false));
    await waitFor(() => expect(result.current).toEqual({ status: "denied" }));
  });

  it("hydrates a stored 'unavailable' decision", async () => {
    await AsyncStorage.setItem(KEY, "unavailable");
    const { result } = renderHook(() => useTrackingDecision(false));
    await waitFor(() => expect(result.current).toEqual({ status: "unavailable" }));
  });

  it("ignores a garbage/unrecognized stored value and, without autoPrompt, stays unknown", async () => {
    await AsyncStorage.setItem(KEY, "garbage");
    const { result } = renderHook(() => useTrackingDecision(false));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toEqual({ status: "unknown" });
  });

  it("auto-prompts when nothing is stored and autoPrompt is true, resolving to the platform's decision", async () => {
    Platform.OS = "android";
    const { result } = renderHook(() => useTrackingDecision(true));
    await waitFor(() => expect(result.current).toEqual({ status: "unavailable" }));
  });

  it("does not re-prompt when a decision is already stored, even with autoPrompt true", async () => {
    await AsyncStorage.setItem(KEY, "granted");
    Platform.OS = "android"; // would resolve to "unavailable" if ensureTrackingDecision ran
    const { result } = renderHook(() => useTrackingDecision(true));
    await waitFor(() => expect(result.current).toEqual({ status: "granted" }));
  });
});
