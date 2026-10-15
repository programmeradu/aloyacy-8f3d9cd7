// Natural-language trip planner card — presentation shell.
//
// All parsing/geocoding state lives in useNLPlanner(); the pure intent
// extraction lives in @aloya/core/nl-intent (regex pass + AI merge).

import { useEffect, useRef } from "react";
import nlIllustration from "@/assets/nl-planner-illustration.jpg";
import { useI18n } from "@/lib/i18n";
import { useNLPlanner } from "@/components/nl/useNLPlanner";
import { NLComposer } from "@/components/nl/NLComposer";
import { NLSuggestions } from "@/components/nl/NLSuggestions";
import { NLResolvedCard } from "@/components/nl/NLResolvedCard";

export function NLPlannerCard({ autoVoice = false }: { autoVoice?: boolean } = {}) {
  const { t } = useI18n();
  const p = useNLPlanner();
  // Opened from the home mic button: start listening once, straight away.
  const voiced = useRef(false);
  useEffect(() => {
    if (!autoVoice || voiced.current) return;
    voiced.current = true;
    p.startVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVoice]);
  const showSuggestions = !p.intent && !p.busy && !p.resolved && !p.error;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-card ring-1 ring-line">
      {/* Editorial gradient corners */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-60"
        style={{ background: "var(--aegean-soft)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-12 size-48 rounded-full blur-3xl opacity-40"
        style={{ background: "var(--ochre-soft)" }}
      />

      {/* Cyprus map fragment with a single bus route */}
      <img
        src={nlIllustration}
        alt=""
        aria-hidden="true"
        loading="lazy"
        width={1024}
        height={1024}
        className="pointer-events-none absolute -top-4 -right-6 size-40 sm:size-48 object-cover object-center opacity-90 mix-blend-multiply select-none [mask-image:radial-gradient(circle_at_60%_40%,black_55%,transparent_78%)]"
      />

      <div className="relative p-5">
        <div className="flex items-center gap-2 pr-28 sm:pr-36">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-aegean-deep">
            {t("nl.kicker")}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <h2 className="font-display text-[2rem] leading-[1.05] text-ink mt-2 pr-24 sm:pr-32">
          {t("nl.title")}
        </h2>
        <p className="font-sans font-medium text-[12.5px] text-ink-soft mt-1.5 pr-24 sm:pr-32">
          {t("nl.sub")}
        </p>

        <NLComposer
          text={p.text}
          onTextChange={(value) => {
            p.setText(value);
            if (p.error) p.setError(null);
          }}
          onSubmit={() => p.submit(p.text)}
          onClear={p.reset}
          onVoice={p.startVoice}
          busy={p.busy}
          stage={p.stage}
          listening={p.listening}
          canSubmit={p.canSubmit}
          inputRef={p.inputRef}
        />

        {showSuggestions && (
          <NLSuggestions
            examples={p.examples}
            reason={p.suggestionReason}
            loading={p.suggestionsLoading}
            onPick={(ex) => {
              p.setText(ex);
              p.submit(ex);
            }}
          />
        )}

        {p.error && (
          <div className="mt-3 rounded-xl bg-ochre-soft/60 px-3 py-2 font-sans font-medium text-[12.5px] text-ink">
            {p.error}
          </div>
        )}

        {p.resolved && (
          <NLResolvedCard resolved={p.resolved} intent={p.intent} onEdit={p.reset} onGo={p.go} />
        )}
      </div>
    </div>
  );
}
