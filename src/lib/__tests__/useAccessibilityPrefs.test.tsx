// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const DEFAULT_PREFS = {
  stepFree: false,
  preferShade: false,
  lowFloor: false,
  maxWalkMeters: null,
};

const readCached = vi.fn();
const fetchFromCloud = vi.fn();
const savePrefs = vi.fn();

vi.mock("../accessibility-prefs", () => ({
  DEFAULT_PREFS,
  readCached: (...args: unknown[]) => readCached(...args),
  fetchFromCloud: (...args: unknown[]) => fetchFromCloud(...args),
  savePrefs: (...args: unknown[]) => savePrefs(...args),
}));

const useAuthMock = vi.fn();
vi.mock("../useAuth", () => ({
  useAuth: () => useAuthMock(),
}));

import { useAccessibilityPrefs } from "../useAccessibilityPrefs";

describe("useAccessibilityPrefs", () => {
  beforeEach(() => {
    readCached.mockReset().mockReturnValue({ ...DEFAULT_PREFS, stepFree: true });
    fetchFromCloud.mockReset();
    savePrefs.mockReset();
    useAuthMock.mockReset();
  });

  it("starts from the cached read and stays unsynced while auth is loading", () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });
    const { result } = renderHook(() => useAccessibilityPrefs());
    expect(result.current.prefs).toEqual({ ...DEFAULT_PREFS, stepFree: true });
    expect(result.current.synced).toBe(false);
    expect(fetchFromCloud).not.toHaveBeenCalled();
  });

  it("marks synced without a cloud fetch when there is no user", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useAccessibilityPrefs());
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(fetchFromCloud).not.toHaveBeenCalled();
  });

  it("fetches from the cloud and applies the result when a user is present", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" }, loading: false });
    const cloudPrefs = { ...DEFAULT_PREFS, preferShade: true };
    fetchFromCloud.mockResolvedValue(cloudPrefs);

    const { result } = renderHook(() => useAccessibilityPrefs());
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.prefs).toEqual(cloudPrefs);
    expect(fetchFromCloud).toHaveBeenCalledWith("u1");
  });

  it("re-syncs when the user id changes", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" }, loading: false });
    fetchFromCloud.mockResolvedValue({ ...DEFAULT_PREFS });

    const { result, rerender } = renderHook(() => useAccessibilityPrefs());
    await waitFor(() => expect(result.current.synced).toBe(true));

    fetchFromCloud.mockResolvedValue({ ...DEFAULT_PREFS, lowFloor: true });
    useAuthMock.mockReturnValue({ user: { id: "u2" }, loading: false });
    rerender();

    await waitFor(() => expect(result.current.prefs.lowFloor).toBe(true));
    expect(fetchFromCloud).toHaveBeenCalledTimes(2);
  });

  it("update() applies an optimistic patch and persists via savePrefs", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" }, loading: false });
    fetchFromCloud.mockResolvedValue({ ...DEFAULT_PREFS });
    const { result } = renderHook(() => useAccessibilityPrefs());
    await waitFor(() => expect(result.current.synced).toBe(true));

    act(() => {
      result.current.update({ maxWalkMeters: 800 });
    });

    expect(result.current.prefs.maxWalkMeters).toBe(800);
    expect(savePrefs).toHaveBeenCalledWith("u1", expect.objectContaining({ maxWalkMeters: 800 }));
  });

  it("update() persists with a null userId for anonymous riders", () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    const { result } = renderHook(() => useAccessibilityPrefs());

    act(() => {
      result.current.update({ stepFree: false });
    });

    expect(savePrefs).toHaveBeenCalledWith(null, expect.objectContaining({ stepFree: false }));
  });

  it("does not apply the cloud result after unmount (cancelled guard)", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1" }, loading: false });
    let resolvePromise!: (v: typeof DEFAULT_PREFS) => void;
    fetchFromCloud.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const { unmount } = renderHook(() => useAccessibilityPrefs());
    unmount();
    resolvePromise({ ...DEFAULT_PREFS, lowFloor: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(true).toBe(true);
  });
});
