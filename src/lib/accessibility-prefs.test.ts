// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
const eq = vi.fn((_col: string, _val: string) => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn((_table: string) => ({ select, upsert }));

// Cloud reads/writes go through server functions now; the session decides
// whose row it is. The query-shaped mocks above feed these stand-ins.
const saveUserSettings = vi.fn(async (args: { data: { patch: Record<string, unknown> } }) => {
  from("user_settings");
  const r = await upsert(args.data.patch);
  return r?.error ? { ok: false, error: r.error.message } : { ok: true };
});
vi.mock("@/lib/user-data.functions", () => ({
  getUserSettings: async () => {
    from("user_settings");
    const r = await maybeSingle();
    return r?.error
      ? { ok: false, error: r.error.message, settings: null }
      : { ok: true, settings: r?.data ?? null };
  },
  saveUserSettings: (args: { data: { patch: Record<string, unknown> } }) => saveUserSettings(args),
}));

import {
  DEFAULT_PREFS,
  isActive,
  normalise,
  readCached,
  fetchFromCloud,
  savePrefs,
  type AccessibilityPrefs,
} from "./accessibility-prefs";

const CACHE_KEY = "aloya:a11yPrefs";

describe("isActive", () => {
  it("is false for the default (all-off) prefs", () => {
    expect(isActive(DEFAULT_PREFS)).toBe(false);
  });

  it.each<[keyof AccessibilityPrefs, unknown]>([
    ["stepFree", true],
    ["preferShade", true],
    ["lowFloor", true],
    ["maxWalkMeters", 500],
  ])("is true when %s is set", (key, value) => {
    expect(isActive({ ...DEFAULT_PREFS, [key]: value })).toBe(true);
  });
});

describe("normalise", () => {
  it("returns defaults for null/undefined/non-object input", () => {
    expect(normalise(null)).toEqual(DEFAULT_PREFS);
    expect(normalise(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalise("nope" as unknown as Partial<AccessibilityPrefs>)).toEqual(DEFAULT_PREFS);
  });

  it("coerces truthy/falsy fields to booleans", () => {
    const result = normalise({
      stepFree: 1,
      preferShade: 0,
      lowFloor: "yes",
    } as unknown as Partial<AccessibilityPrefs>);
    expect(result.stepFree).toBe(true);
    expect(result.preferShade).toBe(false);
    expect(result.lowFloor).toBe(true);
  });

  it("clamps maxWalkMeters to the [100, 3000] range", () => {
    expect(normalise({ maxWalkMeters: 50 }).maxWalkMeters).toBe(100);
    expect(normalise({ maxWalkMeters: 5000 }).maxWalkMeters).toBe(3000);
    expect(normalise({ maxWalkMeters: 1234.6 }).maxWalkMeters).toBe(1235);
  });

  it("treats non-finite or non-number maxWalkMeters as null", () => {
    expect(normalise({ maxWalkMeters: Infinity }).maxWalkMeters).toBeNull();
    expect(normalise({ maxWalkMeters: NaN }).maxWalkMeters).toBeNull();
    expect(normalise({ maxWalkMeters: "500" as unknown as number }).maxWalkMeters).toBeNull();
  });

  it("passes through a value already within bounds", () => {
    expect(normalise({ maxWalkMeters: 800 }).maxWalkMeters).toBe(800);
  });
});

describe("readCached", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when nothing is cached", () => {
    expect(readCached()).toEqual(DEFAULT_PREFS);
  });

  it("returns normalised cached prefs", () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ stepFree: true, maxWalkMeters: 50 }));
    expect(readCached()).toEqual({ ...DEFAULT_PREFS, stepFree: true, maxWalkMeters: 100 });
  });

  it("returns defaults when the cached value is invalid JSON", () => {
    window.localStorage.setItem(CACHE_KEY, "{not json");
    expect(readCached()).toEqual(DEFAULT_PREFS);
  });
});

describe("fetchFromCloud", () => {
  beforeEach(() => {
    window.localStorage.clear();
    maybeSingle.mockReset();
    from.mockClear();
  });

  it("falls back to cache when the query errors", async () => {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...DEFAULT_PREFS, preferShade: true }));
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await fetchFromCloud("u1");
    expect(result).toEqual({ ...DEFAULT_PREFS, preferShade: true });
  });

  it("falls back to cache when data is missing", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await fetchFromCloud("u1");
    expect(result).toEqual(DEFAULT_PREFS);
  });

  it("normalises and caches the cloud value on success", async () => {
    maybeSingle.mockResolvedValue({
      data: { accessibility_prefs: { stepFree: true, maxWalkMeters: 9000 } },
      error: null,
    });
    const result = await fetchFromCloud("u1");
    expect(result).toEqual({ ...DEFAULT_PREFS, stepFree: true, maxWalkMeters: 3000 });
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toEqual(result);
  });
});

describe("savePrefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
    upsert.mockReset();
    from.mockClear();
  });

  it("writes to the local cache and skips the cloud call for anon riders", async () => {
    await savePrefs(null, { ...DEFAULT_PREFS, stepFree: true });
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toEqual({
      ...DEFAULT_PREFS,
      stepFree: true,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts to user_settings for a signed-in rider", async () => {
    upsert.mockResolvedValue({ error: null });
    const next = { ...DEFAULT_PREFS, preferShade: true };
    await savePrefs("u1", next);
    expect(from).toHaveBeenCalledWith("user_settings");
    expect(upsert).toHaveBeenCalledWith({ accessibility_prefs: next });
  });

  it("warns but does not throw when the cloud upsert fails", async () => {
    upsert.mockResolvedValue({ error: { message: "denied" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(savePrefs("u1", DEFAULT_PREFS)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith("[a11y-prefs] save failed:", "denied");
    warnSpy.mockRestore();
  });
});
