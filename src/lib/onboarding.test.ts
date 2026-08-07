// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
const eq = vi.fn((_col: string, _val: string) => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn((_table: string) => ({ select, upsert }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => from(table) },
}));

import { isOnboardedCached, fetchOnboardedAt, markOnboarded } from "./onboarding";

const KEY = "aloya:onboarded";

describe("isOnboardedCached", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing is cached", () => {
    expect(isOnboardedCached()).toBeNull();
  });

  it("returns true for '1'", () => {
    window.localStorage.setItem(KEY, "1");
    expect(isOnboardedCached()).toBe(true);
  });

  it("returns false for '0'", () => {
    window.localStorage.setItem(KEY, "0");
    expect(isOnboardedCached()).toBe(false);
  });

  it("returns null for garbage values", () => {
    window.localStorage.setItem(KEY, "garbage");
    expect(isOnboardedCached()).toBeNull();
  });
});

describe("fetchOnboardedAt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    maybeSingle.mockReset();
    upsert.mockReset();
    from.mockClear();
  });

  it("returns false and does not cache when the query errors", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await fetchOnboardedAt("u1");
    expect(result).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("returns false and caches '0' when onboarded_at is null", async () => {
    maybeSingle.mockResolvedValue({ data: { onboarded_at: null }, error: null });
    const result = await fetchOnboardedAt("u1");
    expect(result).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("0");
  });

  it("returns true and caches '1' when onboarded_at is set", async () => {
    maybeSingle.mockResolvedValue({ data: { onboarded_at: "2024-01-01" }, error: null });
    const result = await fetchOnboardedAt("u1");
    expect(result).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("returns false when data itself is missing", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await fetchOnboardedAt("u1");
    expect(result).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("0");
  });
});

describe("markOnboarded", () => {
  beforeEach(() => {
    window.localStorage.clear();
    upsert.mockReset();
    from.mockClear();
  });

  it("caches '1' immediately and upserts onboarded_at", async () => {
    upsert.mockResolvedValue({ error: null });
    await markOnboarded("u1");
    expect(window.localStorage.getItem(KEY)).toBe("1");
    expect(from).toHaveBeenCalledWith("user_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", onboarded_at: expect.any(String) }),
      { onConflict: "user_id" },
    );
  });

  it("still caches locally and warns when the upsert fails", async () => {
    upsert.mockResolvedValue({ error: { message: "denied" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await markOnboarded("u1");
    expect(window.localStorage.getItem(KEY)).toBe("1");
    expect(warnSpy).toHaveBeenCalledWith("[onboarding] mark failed:", "denied");
    warnSpy.mockRestore();
  });
});
