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
import { fetchRemoteSettings, saveRemoteSettings } from "./auth";


export const LOCALES = ["en", "el"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  el: { native: "Ελληνικά", english: "Greek" },
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
    "settings.support": "Support & FAQ",
    "settings.greenLine": "Green Line",
    "settings.version": "Version",
    "settings.build": "Build",
    "wallet.settingsRow": "App settings",
    "wallet.settingsRow.value": "Language, notifications, legal",
    "common.on": "On",
    "common.off": "Off",
    "gl.eyebrow": "Republic of Cyprus",
    "gl.title": "The Green Line.",
    "gl.lede":
      "This app is the Republic bus network. Crossing into the north is a different problem. We name it so the silence does not look like a hole.",
    "gl.know.label": "What we know",
    "gl.know.network.title": "Republic buses only",
    "gl.know.network.body":
      "Every live number, every stop, every route in Aloya is south of the line. OSEL, EMEL, Intercity, Zinonas, OSYPA, Pame. Not the north.",
    "gl.know.ledra.title": "Ledra Street is the pedestrian crossing",
    "gl.know.ledra.body":
      "In the old town, a short walk from Solomos Square. Passport or ID. There are vehicle crossings too. We do not run any of them.",
    "gl.know.famagusta.title": "Famagusta, in this product",
    "gl.know.famagusta.body":
      "Means the Republic catchment: Paralimni, Deryneia, Ayia Napa, Protaras. Not the city north of the line. We do not pretend otherwise.",
    "gl.dont.label": "What we do not have",
    "gl.dont.hours.title": "Official crossing hours",
    "gl.dont.hours.body":
      "Tourist blogs disagree. We have no official hours feed, so we will not print a time that we cannot stand behind. Check at the crossing.",
    "gl.dont.gtfs.title": "North-side GTFS",
    "gl.dont.gtfs.body":
      "No published stop list, no live vehicles, no timetable we can measure. If it is not in the Republic feeds, it is not in Aloya.",
    "gl.search.title": "The Green Line",
    "gl.search.sub": "Republic network. Crossing named, not operated.",
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
    "settings.support": "Υποστήριξη & FAQ",
    "settings.greenLine": "Πράσινη Γραμμή",
    "settings.version": "Έκδοση",
    "settings.build": "Build",
    "wallet.settingsRow": "Ρυθμίσεις εφαρμογής",
    "wallet.settingsRow.value": "Γλώσσα, ειδοποιήσεις, νομικά",
    "common.on": "Ενεργό",
    "common.off": "Ανενεργό",
    "gl.eyebrow": "Κυπριακή Δημοκρατία",
    "gl.title": "Η Πράσινη Γραμμή.",
    "gl.lede":
      "Αυτή η εφαρμογή είναι το δίκτυο λεωφορείων της Δημοκρατίας. Η διάβαση προς τα βόρεια είναι άλλο πρόβλημα. Το λέμε ονομαστικά, για να μην μοιάζει η σιωπή με κενό.",
    "gl.know.label": "Τι ξέρουμε",
    "gl.know.network.title": "Μόνο λεωφορεία της Δημοκρατίας",
    "gl.know.network.body":
      "Κάθε ζωντανός αριθμός, κάθε στάση, κάθε γραμμή στην Aloya είναι νότια της γραμμής. OSEL, EMEL, Intercity, Ζήνωνας, OSYPA, Pame. Όχι τα βόρεια.",
    "gl.know.ledra.title": "Η οδός Λήδρας είναι η πεζή διάβαση",
    "gl.know.ledra.body":
      "Στην παλιά πόλη, λίγα λεπτά από την Πλατεία Σολωμού. Διαβατήριο ή ταυτότητα. Υπάρχουν και διαβάσεις οχημάτων. Δεν τις λειτουργούμε.",
    "gl.know.famagusta.title": "Αμμόχωστος, σε αυτό το προϊόν",
    "gl.know.famagusta.body":
      "Σημαίνει την λεκάνη της Δημοκρατίας: Παραλίμνι, Δερύνεια, Αγία Νάπα, Πρωταράς. Όχι την πόλη βόρεια της γραμμής. Δεν προσποιούμαστε το αντίθετο.",
    "gl.dont.label": "Τι δεν έχουμε",
    "gl.dont.hours.title": "Επίσημο ωράριο διάβασης",
    "gl.dont.hours.body":
      "Τα τουριστικά ιστολόγια διαφωνούν. Δεν έχουμε επίσημη ροή ωραρίων, οπότε δεν τυπώνουμε ώρα που δεν μπορούμε να υποστηρίξουμε. Ρωτήστε στη διάβαση.",
    "gl.dont.gtfs.title": "GTFS από τα βόρεια",
    "gl.dont.gtfs.body":
      "Δεν υπάρχει δημοσιευμένος κατάλογος στάσεων, ούτε ζωντανά οχήματα, ούτε πρόγραμμα που να μετράμε. Αν δεν είναι στις ροές της Δημοκρατίας, δεν είναι στην Aloya.",
    "gl.search.title": "Η Πράσινη Γραμμή",
    "gl.search.sub": "Δίκτυο Δημοκρατίας. Η διάβαση ονομαστικά, όχι λειτουργία.",
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
  // Opportunistic cloud sync — prefer the rider's synced locale (guest or
  // email session) so it roams across web + devices.
  void (async () => {
    const remote = (await fetchRemoteSettings())?.locale;
    if (remote && (LOCALES as readonly string[]).includes(remote) && remote !== current) {
      current = remote as Locale;
      try {
        await AsyncStorage.setItem(STORAGE_KEY, remote);
      } catch {
        // in-memory value still applies
      }
      notify();
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
  // Mirror to the rider's synced settings; ignore failures.
  void saveRemoteSettings({ locale: next });
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
