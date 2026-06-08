// Compact two-state language toggle. Uses typographic separator (an em rule),
// not a bullet — per project memory.

import { LOCALES, useI18n, type Locale } from "@/lib/i18n";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border border-ink/10 bg-limestone/60 px-1 py-1 text-[11px] font-mono uppercase tracking-[0.14em] ${className}`}
      role="group"
      aria-label={t("locale.label")}
    >
      {LOCALES.map((opt) => {
        const active = opt.code === locale;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLocale(opt.code as Locale)}
            aria-pressed={active}
            className={`rounded-full px-2 py-0.5 transition ${
              active ? "bg-ink text-limestone" : "text-ink/60 hover:text-ink"
            }`}
          >
            {opt.native}
          </button>
        );
      })}
    </div>
  );
}
