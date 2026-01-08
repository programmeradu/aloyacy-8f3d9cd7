// Lightweight i18n. No runtime deps. Dictionaries are typed; missing keys
// fall back to English and never crash. Locale is stored in localStorage
// (`aloya:locale`) and persisted to `user_settings.locale` opportunistically
// once cloud-sync covers settings.

import { useCallback, useEffect, useState } from "react";

export type Locale = "en" | "el";
export const LOCALES: { code: Locale; label: string; native: string }[] = [
  { code: "en", label: "English", native: "EN" },
  { code: "el", label: "Ελληνικά", native: "EL" },
];

const KEY = "aloya:locale";
const EVENT = "aloya:locale";

function readLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(KEY);
  return v === "el" ? "el" : "en";
}

export function setLocale(next: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, next);
  document.documentElement.setAttribute("lang", next);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { locale: next } }));
}

import { en } from "./dictionaries/en";
import { el } from "./dictionaries/el";

export type Dictionary = Record<keyof typeof en, string>;
export type DictKey = keyof typeof en;

const dicts: Record<Locale, Dictionary> = { en, el };

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function useI18n() {
  const [locale, setState] = useState<Locale>(readLocale);

  useEffect(() => {
    setState(readLocale());
    document.documentElement.setAttribute("lang", readLocale());
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ locale: Locale }>).detail?.locale;
      if (next) setState(next);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const t = useCallback(
    (key: DictKey, vars?: Record<string, string | number>): string => {
      const dict = dicts[locale];
      const raw = dict[key] ?? en[key] ?? String(key);
      return format(raw, vars);
    },
    [locale],
  );

  return { locale, setLocale, t };
}
