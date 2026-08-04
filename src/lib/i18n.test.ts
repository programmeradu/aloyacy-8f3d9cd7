// Offline, deterministic tests for the lightweight i18n helper. No React
// rendering here — we exercise the pure pieces (readLocale/setLocale via a
// jsdom-backed window/localStorage, plus the format() interpolation logic
// indirectly through useI18n's `t`) and the dictionaries' key parity.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { setLocale, useI18n, LOCALES, type Locale } from "./i18n";
import { en } from "./dictionaries/en";
import { el } from "./dictionaries/el";

const KEY = "aloya:locale";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("lang");
});

describe("LOCALES", () => {
  it("exposes exactly en and el with labels", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["en", "el"]);
    expect(LOCALES.find((l) => l.code === "en")?.native).toBe("EN");
    expect(LOCALES.find((l) => l.code === "el")?.native).toBe("EL");
  });
});

describe("dictionaries", () => {
  it("el has the exact same key set as en (no missing/extra translations)", () => {
    const enKeys = Object.keys(en).sort();
    const elKeys = Object.keys(el).sort();
    expect(elKeys).toEqual(enKeys);
  });

  it("no dictionary value is an empty string", () => {
    for (const [k, v] of Object.entries(en)) expect(v, `en.${k}`).not.toBe("");
    for (const [k, v] of Object.entries(el)) expect(v, `el.${k}`).not.toBe("");
  });

  it("placeholders used in en templates also appear in the matching el template", () => {
    const placeholderRe = /\{(\w+)\}/g;
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const enPlaceholders = [...en[key].matchAll(placeholderRe)].map((m) => m[1]).sort();
      const elPlaceholders = [...el[key].matchAll(placeholderRe)].map((m) => m[1]).sort();
      expect(elPlaceholders, `key ${String(key)}`).toEqual(enPlaceholders);
    }
  });
});

describe("setLocale", () => {
  it("persists the locale to localStorage", () => {
    setLocale("el");
    expect(window.localStorage.getItem(KEY)).toBe("el");
  });

  it("sets the <html lang> attribute", () => {
    setLocale("el");
    expect(document.documentElement.getAttribute("lang")).toBe("el");
    setLocale("en");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
  });

  it("dispatches an aloya:locale CustomEvent with the new locale in detail", () => {
    const handler = vi.fn();
    window.addEventListener("aloya:locale", handler);
    setLocale("el");
    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0] as CustomEvent<{ locale: Locale }>;
    expect(evt.detail.locale).toBe("el");
    window.removeEventListener("aloya:locale", handler);
  });
});

describe("useI18n", () => {
  it("defaults to 'en' when nothing is stored", () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.locale).toBe("en");
  });

  it("reads a previously persisted locale on mount", () => {
    window.localStorage.setItem(KEY, "el");
    const { result } = renderHook(() => useI18n());
    expect(result.current.locale).toBe("el");
  });

  it("treats any non-'el' stored value as 'en'", () => {
    window.localStorage.setItem(KEY, "fr");
    const { result } = renderHook(() => useI18n());
    expect(result.current.locale).toBe("en");
  });

  it("t() returns the English string by default", () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("common.back")).toBe(en["common.back"]);
  });

  it("t() switches dictionaries after calling setLocale, reflected via the locale-change event", () => {
    const { result } = renderHook(() => useI18n());
    act(() => {
      result.current.setLocale("el");
    });
    expect(result.current.locale).toBe("el");
    expect(result.current.t("common.back")).toBe(el["common.back"]);
  });

  it("t() interpolates {placeholders} from the vars object", () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("resume.busTo", { code: "101" } as any)).toContain("101");
    expect(result.current.t("trip.minTotal", { m: 12 } as any)).toBe("12 min total");
  });

  it("t() leaves unmatched placeholders untouched instead of throwing", () => {
    const { result } = renderHook(() => useI18n());
    // trip.minTotal has one placeholder {m}; omit it entirely.
    expect(result.current.t("trip.minTotal")).toBe("{m} min total");
  });

  it("t() falls back to the key name for an unknown key (never crashes)", () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("does.not.exist" as any)).toBe("does.not.exist");
  });

  it("multiple hook instances stay in sync via the shared locale-change event", () => {
    const a = renderHook(() => useI18n());
    const b = renderHook(() => useI18n());
    act(() => {
      a.result.current.setLocale("el");
    });
    expect(a.result.current.locale).toBe("el");
    expect(b.result.current.locale).toBe("el");
  });
});
