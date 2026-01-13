// Compact two-state language toggle. Uses typographic separator (an em rule),
// not a bullet — per project memory.

import { LOCALES, useI18n, type Locale } from "@/lib/i18n";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={`inline-flex items-center gap-2 font-sans text-[12px] font-semibold tracking-tight ${className}`}
      role="group"
      aria-label={t("locale.label")}
    >
      {LOCALES.map((opt, i) => {
        const active = opt.code === locale;
        return (
          <span key={opt.code} className="inline-flex items-center gap-2">
            {i > 0 && <span aria-hidden className="h-3 w-px bg-ink/20" />}
            <button
              type="button"
              onClick={() => setLocale(opt.code as Locale)}
              aria-pressed={active}
              className={`transition-colors ${
                active ? "text-ink" : "text-ink/40 hover:text-ink/70"
              }`}
            >
              {opt.code.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}
