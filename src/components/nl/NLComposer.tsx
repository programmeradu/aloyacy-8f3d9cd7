// Composer row for the natural-language planner: input, clear, voice, submit
// and the stage label that appears while parsing/geocoding.

import type { RefObject } from "react";
import { IconArrowUp, IconClose, IconMic, IconNav } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import type { PlannerStage } from "./useNLPlanner";

type Props = {
  text: string;
  onTextChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onVoice: () => void;
  busy: boolean;
  stage: PlannerStage;
  listening: boolean;
  canSubmit: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function NLComposer({
  text,
  onTextChange,
  onSubmit,
  onClear,
  onVoice,
  busy,
  stage,
  listening,
  canSubmit,
  inputRef,
}: Props) {
  const { t } = useI18n();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-4"
    >
      <div className="group relative flex items-center rounded-2xl bg-background ring-1 ring-line focus-within:ring-aegean-deep transition shadow-sm">
        <span className="pl-3.5 text-ink-soft">
          <IconNav className="size-4" />
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={listening ? t("nl.listening") : t("nl.placeholder")}
          aria-label={t("nl.aria.describe")}
          className="flex-1 min-w-0 bg-transparent outline-none font-sans font-medium text-[14.5px] text-ink placeholder:text-ink-soft/60 placeholder:font-medium px-2.5 py-3"
          autoComplete="off"
          maxLength={500}
          disabled={listening}
        />
        {text.length > 0 && !busy && (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("nl.aria.clear")}
            className="mr-1 grid place-items-center size-7 shrink-0 rounded-full text-ink-soft hover:text-ink hover:bg-line transition"
          >
            <IconClose className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onVoice}
          aria-label={listening ? t("nl.aria.voiceStop") : t("nl.aria.voice")}
          aria-pressed={listening}
          className={`mr-1 grid place-items-center size-9 shrink-0 rounded-full transition ${
            listening
              ? "bg-ochre text-card animate-pulse"
              : "text-ink-soft hover:text-ink hover:bg-line"
          }`}
        >
          <IconMic className="size-4" />
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={t("nl.aria.plan")}
          className="mr-1.5 grid place-items-center size-10 shrink-0 rounded-full bg-ink text-card transition disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-aegean-deep enabled:active:scale-95"
        >
          {busy ? (
            <span className="size-4 rounded-full border-2 border-card/30 border-t-card animate-spin" />
          ) : (
            <IconArrowUp className="size-4" />
          )}
        </button>
      </div>

      {busy && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-aegean-deep flex items-center gap-1.5">
          <span className="inline-block size-1 rounded-full bg-aegean-deep animate-pulse" />
          {stage === "parsing" ? t("nl.stage.parsing") : t("nl.stage.locating")}
        </p>
      )}
    </form>
  );
}
