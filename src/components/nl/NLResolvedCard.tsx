// The "here's what I understood" confirmation block: origin/destination pair,
// optional time anchor, and the edit/plan actions.

import { describeWhen, type LocalIntent } from "@aloya/core/nl-intent";
import { IconArrowUp, IconClockSmall } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import type { ResolvedPoint } from "./useNLPlanner";

type Props = {
  resolved: { from: ResolvedPoint | null; to: ResolvedPoint };
  intent: LocalIntent | null;
  onEdit: () => void;
  onGo: () => void;
};

export function NLResolvedCard({ resolved, intent, onEdit, onGo }: Props) {
  const { t, locale } = useI18n();
  const whenISO = intent?.arriveByISO ?? intent?.leaveByISO ?? null;

  return (
    <div className="mt-4 rounded-2xl bg-background ring-1 ring-aegean-deep/30 p-4 animate-rise">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-aegean-deep">
        {t("nl.got")}
      </p>

      <div className="mt-2 flex items-start gap-3">
        <div className="flex flex-col items-center pt-1.5">
          <span className="size-2 rounded-full ring-2 ring-aegean-deep" />
          <span className="my-1 w-px flex-1 min-h-[18px] bg-line" />
          <span className="size-2 rounded-full bg-ochre" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-sans font-semibold text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            {t("nl.from")}
          </p>
          {/* Place names can be long — wrap rather than clip. */}
          <p className="font-display text-[18px] leading-tight text-ink break-words">
            {resolved.from?.label ?? t("nl.yourLocation")}
          </p>
          <p className="font-sans font-semibold text-[11px] uppercase tracking-[0.16em] text-ink-soft mt-2">
            {t("nl.to")}
          </p>
          <p className="font-display text-[18px] leading-tight text-ink break-words">
            {resolved.to.label}
          </p>
        </div>
      </div>

      {whenISO && (
        <div className="mt-3 flex items-start gap-1.5 font-mono text-[11px] text-aegean-deep">
          <IconClockSmall className="size-3.5 shrink-0 mt-px" />
          <span>
            {intent?.arriveByISO
              ? t("nl.arriveBy", { time: formatWhen(whenISO, t, locale) })
              : t("nl.leaveAt", { time: formatWhen(whenISO, t, locale) })}
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-full ring-1 ring-line bg-card text-ink font-eyebrow text-[10px] uppercase py-2.5 hover:ring-ink transition"
        >
          {t("nl.edit")}
        </button>
        <button
          type="button"
          onClick={onGo}
          className="flex-[2] flex items-center justify-center gap-1.5 rounded-full bg-ink text-card font-eyebrow text-[10px] uppercase py-2.5 hover:bg-aegean-deep transition"
        >
          {t("nl.plan")}
          <IconArrowUp className="size-3 rotate-90" />
        </button>
      </div>
    </div>
  );
}

type TFn = (key: import("@/lib/i18n").DictKey, vars?: Record<string, string | number>) => string;

function formatWhen(iso: string, t: TFn, locale: string): string {
  const parts = describeWhen(iso, locale === "el" ? "el-GR" : undefined);
  switch (parts.kind) {
    case "today":
      return t("nl.when.atTime", { time: parts.time });
    case "tomorrow":
      return t("nl.when.tomorrow", { time: parts.time });
    case "dow":
      return t("nl.when.dow", { dow: parts.dow, time: parts.time });
    default:
      return parts.time;
  }
}
