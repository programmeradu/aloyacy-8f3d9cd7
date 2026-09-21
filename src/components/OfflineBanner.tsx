import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useI18n } from "@/lib/i18n";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { locale } = useI18n();

  if (isOnline) return null;

  const isEl = locale === "el";

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-amber-50/95 dark:bg-amber-950/90 backdrop-blur-md border-b border-amber-200/50 dark:border-amber-800/50 px-4 py-2 shadow-sm transition-all animate-rise"
    >
      <div className="mx-auto max-w-xl flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink font-semibold shrink-0">
            {isEl ? "Εκτος συνδεσης" : "Offline"}
          </p>
          <span className="text-ink-soft/60 hidden sm:inline">•</span>
          <p className="text-ink-soft text-[11.5px] truncate">
            {isEl
              ? "Τηλεμετρία σε παύση. GPS & αποθηκευμένα ενεργά."
              : "Live radar paused. GPS & saved trips active."}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-amber-900 dark:text-amber-200 hover:underline font-semibold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40"
        >
          {isEl ? "Επαναληψη" : "Retry"}
        </button>
      </div>
    </div>
  );
}
