// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGoogleMaps, ALOYA_MAP_STYLE, setGoogleMapsKeyOverride } from "../useGoogleMaps";

describe("useGoogleMaps", () => {
  const originalGoogle = window.google;
  const originalPromise = window.__aloyaGmapsPromise;
  const originalInit = window.__aloyaGmapsInit;

  beforeEach(() => {
    delete (window as unknown as { google?: unknown }).google;
    delete (window as unknown as { __aloyaGmapsPromise?: unknown }).__aloyaGmapsPromise;
    delete (window as unknown as { __aloyaGmapsInit?: unknown }).__aloyaGmapsInit;
    setGoogleMapsKeyOverride(null);
  });

  afterEach(() => {
    window.google = originalGoogle;
    window.__aloyaGmapsPromise = originalPromise;
    window.__aloyaGmapsInit = originalInit;
    setGoogleMapsKeyOverride(null);
    vi.restoreAllMocks();
  });

  it("exports a valid editorial light map style array", () => {
    expect(Array.isArray(ALOYA_MAP_STYLE)).toBe(true);
    expect(ALOYA_MAP_STYLE.length).toBeGreaterThan(0);
    expect(ALOYA_MAP_STYLE[0]).toHaveProperty("elementType");
  });

  it("returns existing google object immediately if already attached to window", () => {
    const mockMaps = { Map: vi.fn(), importLibrary: vi.fn() };
    window.google = { maps: mockMaps } as unknown as typeof google;

    const { result } = renderHook(() => useGoogleMaps());
    expect(result.current.api).toBe(window.google);
    expect(result.current.error).toBeNull();
  });

  it("degrades gracefully with 'missing maps key' when getGoogleMapsKey returns empty", async () => {
    setGoogleMapsKeyOverride("");

    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(result.current.api).toBeNull();
      expect(result.current.error).toBe("missing maps key");
    });
  });

  it("degrades gracefully when script injection triggers onerror", async () => {
    setGoogleMapsKeyOverride("test-api-key");

    // Intercept appendChild on head to simulate script failure
    const appendSpy = vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) {
        setTimeout(() => {
          node.onerror?.(new Event("error") as unknown as string);
        }, 10);
      }
      return node;
    });

    const { result } = renderHook(() => useGoogleMaps());

    await waitFor(() => {
      expect(result.current.api).toBeNull();
      expect(result.current.error).toBe("maps script failed");
    });

    appendSpy.mockRestore();
  });
});
