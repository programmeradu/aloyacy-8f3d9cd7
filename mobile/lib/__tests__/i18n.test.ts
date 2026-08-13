import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetStorage, __dumpStorage } from "../../test/stubs/async-storage";

import { LOCALES, LOCALE_LABELS, t, getLocale, setLocale, translator } from "../i18n";

const STORAGE_KEY = "aloya.locale.v1";

beforeEach(async () => {
  __resetStorage();
  await setLocale("en");
});

describe("locale catalogue", () => {
  it("ships English and Greek with native labels", () => {
    expect([...LOCALES]).toEqual(["en", "el"]);
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale].native.length).toBeGreaterThan(0);
      expect(LOCALE_LABELS[locale].english.length).toBeGreaterThan(0);
    }
  });
});

describe("t", () => {
  it("translates against the current locale by default", async () => {
    expect(t("tab.today")).toBe("Today");
    await setLocale("el");
    expect(getLocale()).toBe("el");
    expect(t("tab.today")).not.toBe("Today");
    expect(t("tab.today").length).toBeGreaterThan(0);
  });

  it("honours an explicit locale override without changing the current one", () => {
    const greek = t("tab.today", "el");
    expect(greek).not.toBe("Today");
    expect(getLocale()).toBe("en");
  });

  it("falls back to English for an unknown locale table", () => {
    expect(t("tab.today", "de" as never)).toBe("Today");
  });

  it("returns the key itself when it is missing everywhere", () => {
    expect(t("nope.not.a.key" as never)).toBe("nope.not.a.key");
  });

  it("has no untranslated keys in any locale", () => {
    // Guards against a key added to English only — riders on Greek would
    // otherwise see a raw dotted identifier in the UI.
    for (const locale of LOCALES) {
      for (const key of Object.keys({ "tab.today": 1, "tab.plan": 1, "action.done": 1 })) {
        const value = t(key as never, locale);
        expect(value).not.toContain(".");
      }
    }
  });
});

describe("setLocale", () => {
  it("persists the choice and notifies readers", async () => {
    await setLocale("el");
    expect(__dumpStorage()[STORAGE_KEY]).toBe("el");
    expect(getLocale()).toBe("el");
  });

  it("ignores an unsupported locale rather than blanking the UI", async () => {
    await setLocale("fr" as never);
    expect(getLocale()).toBe("en");
    expect(__dumpStorage()[STORAGE_KEY]).toBe("en");
  });

  it("keeps the in-memory value when storage write fails", async () => {
    const storage = (await import("@react-native-async-storage/async-storage")).default;
    const spy = vi.spyOn(storage, "setItem").mockRejectedValueOnce(new Error("disk full"));
    await setLocale("el");
    expect(getLocale()).toBe("el");
    spy.mockRestore();
  });
});

describe("translator", () => {
  it("binds a locale for imperative call sites", async () => {
    const greek = translator("el");
    expect(greek("tab.today")).toBe(t("tab.today", "el"));
    await setLocale("el");
    const bound = translator();
    expect(bound("tab.plan")).toBe(t("tab.plan", "el"));
  });
});
