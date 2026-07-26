// Dynamic example chips shown while the planner is idle. Reason comes from
// the server: "personal" (rider habit), "trending" (island-wide) or generic.

import { IconArrowUp } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";

type Props = {
  examples: string[];
  reason: string | null;
  loading: boolean;
  onPick: (example: string) => void;
};

export function NLSuggestions({ examples, reason, loading, onPick }: Props) {
  const { t } = useI18n();
  const heading =
    reason === "personal"
      ? t("nl.sugg.personal")
      : reason === "trending"
        ? t("nl.sugg.trending")
        : t("nl.sugg.try");

  return (
    <div className="mt-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft mb-2">
        {heading}
      </p>
      <div className="flex flex-col gap-1.5">
        {loading && examples.length === 0
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-xl bg-background ring-1 ring-line animate-pulse"
              />
            ))
          : examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => onPick(ex)}
                className="group text-left rounded-xl bg-background ring-1 ring-line px-3 py-2 hover:ring-aegean-deep hover:bg-card transition flex items-center justify-between gap-2"
              >
                <span className="font-sans font-medium text-[13px] text-ink">{ex}</span>
                <IconArrowUp className="size-3 shrink-0 text-ink-soft rotate-45 group-hover:text-aegean-deep transition" />
              </button>
            ))}
      </div>
    </div>
  );
}
