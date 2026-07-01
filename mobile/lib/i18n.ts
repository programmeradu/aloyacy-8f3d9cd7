// Aloya mobile i18n — lightweight dictionary + hook.
//
// Ships with the three languages Cyprus riders actually use:
//   - en (English, default)
//   - el (Greek)
//   - ru (Russian, large expat community in Limassol/Paphos)
//
// We intentionally do NOT port the whole web `@aloya/core` i18n bundle —
// mobile surfaces the keys the rider sees on the screens we actually
// render natively (tabs, wallet, settings, common actions). Web-only
// long-form editorial stays on the web.
//
// Detection order on first launch:
//   1. Explicit override stored under `aloya.locale.v1`.
//   2. Device locale from `expo-localization` (only if we support it).
//   3. Fallback to English.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "./supabase";


export const LOCALES = ["en", "el", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  el: { native: "Ελληνικά", english: "Greek" },
  ru: { native: "Русский", english: "Russian" },
};

const STORAGE_KEY = "aloya.locale.v1";

// Keep dictionaries compact — only what the app surfaces natively.
// Adding a new key requires filling every locale to keep TypeScript happy.
const DICT = {
  en: {
    "tab.today": "Today",
    "tab.pulse": "Pulse",
    "tab.plan": "Plan",
    "tab.search": "Search",
    "tab.saved": "Saved",
    "tab.wallet": "Wallet",
    "action.settings": "Settings",
    "action.done": "Done",
    "action.cancel": "Cancel",
    "action.save": "Save",
    "action.retry": "Try again",
    "action.signOut": "Sign out",
    "settings.title": "Settings",
    "settings.subtitle": "Language, accessibility, notifications, and legal.",
    "settings.language": "Language",
    "settings.language.foot": "Applies to labels the app renders itself. Live feed content stays in its source language.",
    "settings.accessibility": "Accessibility",
    "settings.accessibility.foot": "Planner honours these when routing.",
    "settings.notifications": "Notifications",
    "settings.privacy": "Privacy",
    "settings.terms": "Terms",
    "settings.about": "About Aloya",
    "settings.version": "Version",
    "settings.build": "Build",
    "wallet.settingsRow": "App settings",
    "wallet.settingsRow.value": "Language, notifications, legal",
    "common.on": "On",
    "common.off": "Off",
  },
  el: {
    "tab.today": "Σήμερα",
    "tab.pulse": "Παλμός",
    "tab.plan": "Σχέδιο",
    "tab.search": "Αναζήτηση",
    "tab.saved": "Αποθηκευμένα",
    "tab.wallet": "Πορτοφόλι",
    "action.settings": "Ρυθμίσεις",
    "action.done": "Έτοιμο",
    "action.cancel": "Άκυρο",
    "action.save": "Αποθήκευση",
    "action.retry": "Δοκίμασε ξανά",
    "action.signOut": "Αποσύνδεση",
    "settings.title": "Ρυθμίσεις",
    "settings.subtitle": "Γλώσσα, προσβασιμότητα, ειδοποιήσεις και όροι.",
    "settings.language": "Γλώσσα",
    "settings.language.foot": "Ισχύει για τις ετικέτες της εφαρμογής. Το ζωντανό περιεχόμενο μένει στη γλώσσα πηγής.",
    "settings.accessibility": "Προσβασιμότητα",
    "settings.accessibility.foot": "Ο σχεδιαστής διαδρομών τις λαμβάνει υπόψη.",
    "settings.notifications": "Ειδοποιήσεις",
    "settings.privacy": "Απόρρητο",
    "settings.terms": "Όροι",
    "settings.about": "Σχετικά με την Aloya",
    "settings.version": "Έκδοση",
    "settings.build": "Build",
    "wallet.settingsRow": "Ρυθμίσεις εφαρμογής",
    "wallet.settingsRow.value": "Γλώσσα, ειδοποιήσεις, νομικά",
    "common.on": "Ενεργό",
    "common.off": "Ανενεργό",
  },
  ru: {
    "tab.today": "Сегодня",
    "tab.pulse": "Пульс",
    "tab.plan": "План",
    "tab.search": "Поиск",
    "tab.saved": "Избранное",
    "tab.wallet": "Кошелёк",
    "action.settings": "Настройки",
    "action.done": "Готово",
    "action.cancel": "Отмена",
    "action.save": "Сохранить",
    "action.retry": "Повторить",
    "action.signOut": "Выйти",
    "settings.title": "Настройки",
    "settings.subtitle": "Язык, доступность, уведомления и правовая информация.",
    "settings.language": "Язык",
    "settings.language.foot": "Применяется к подписям приложения. Живые данные остаются на языке источника.",
    "settings.accessibility": "Доступность",
    "settings.accessibility.foot": "Планировщик учитывает эти настройки.",
    "settings.notifications": "Уведомления",
    "settings.privacy": "Конфиденциальность",
    "settings.terms": "Условия",
    "settings.about": "О приложении Aloya",
    "settings.version": "Версия",
    "settings.build": "Сборка",
    "wallet.settingsRow": "Настройки приложения",
    "wallet.settingsRow.value": "Язык, уведомления, правовое",
    "common.on": "Вкл",
    "common.off": "Выкл",
  },
} satisfies Record<Locale, Record<string, string>>;

export type I18nKey = keyof (typeof DICT)["en"];

// --- Tiny observable store so every hook consumer re-renders on change. ---

let current: Locale = "en";
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function detectDeviceLocale(): Locale {
  try {
    const locales = Localization.getLocales?.() ?? [];
    for (const l of locales) {
      const code = (l.languageCode ?? "").toLowerCase();
      if ((LOCALES as readonly string[]).includes(code)) return code as Locale;
    }
  } catch {
    // ignore — expo-localization can throw during SSR / tests.
  }
  return "en";
}

let hydrated = false;
async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      current = stored as Locale;
    } else {
      current = detectDeviceLocale();
    }
    notify();
  } catch {
    current = detectDeviceLocale();
    notify();
  }
  // Opportunistic cloud sync — if the rider is signed in, prefer their
  // server-side locale so it roams across web + devices.
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_settings")
        .select("locale")
        .eq("user_id", user.id)
        .maybeSingle();
      const remote = data?.locale;
      if (remote && (LOCALES as readonly string[]).includes(remote) && remote !== current) {
        current = remote as Locale;
        await AsyncStorage.setItem(STORAGE_KEY, remote);
        notify();
      }
    } catch {
      // offline / unauthenticated — local value wins.
    }
  })();
}

export async function setLocale(next: Locale) {
  if (!(LOCALES as readonly string[]).includes(next)) return;
  current = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    // best effort — hold the in-memory value regardless.
  }
  notify();
  // Mirror to cloud when signed in; ignore failures.
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, locale: next }, { onConflict: "user_id" });
    } catch {
      // best effort
    }
  })();
}


export function getLocale(): Locale {
  return current;
}

export function t(key: I18nKey, locale: Locale = current): string {
  const table = DICT[locale] ?? DICT.en;
  return table[key] ?? DICT.en[key] ?? String(key);
}

export function useLocale() {
  // Fire hydration once; subsequent calls are cheap no-ops.
  useEffect(() => {
    void hydrate();
  }, []);
  const locale = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
  return {
    locale,
    setLocale,
    t: (key: I18nKey) => t(key, locale),
  };
}

// Non-hook helper for components that want to render once with the current
// locale without subscribing (e.g. inside imperative Alerts).
export function translator(locale: Locale = current) {
  return (key: I18nKey) => t(key, locale);
}
