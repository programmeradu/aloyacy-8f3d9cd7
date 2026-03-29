// Wave 2.2 — Accessibility Preferences card.
//
// Lives in /wallet. Compact editorial treatment: ink-on-limestone, mono
// numerals, no generic icons. Toggles keep a 36px+ tap target without
// dominating the page.

import { useId } from "react";
import { useAccessibilityPrefs } from "@/lib/useAccessibilityPrefs";
import { useI18n } from "@/lib/i18n";

const WALK_CAP_STEPS = [400, 600, 800, 1000, 1200, 1500, 2000] as const;

export function AccessibilityPrefsCard() {
  const { t } = useI18n();
  const { prefs, update } = useAccessibilityPrefs();
  const stepFreeId = useId();
  const shadeId = useId();

  const capLabel =
    prefs.maxWalkMeters == null
      ? t("a11y.cap.none")
      : t("a11y.cap.value", { m: prefs.maxWalkMeters });

  return (
    <article className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-line">
      <header className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-soft">
            {t("a11y.eyebrow")}
          </p>
          <h2 className="mt-0.5 font-display text-[16px] font-semibold leading-tight text-ink">
            {t("a11y.title")}
          </h2>
        </div>
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          {prefs.stepFree || prefs.preferShade || prefs.maxWalkMeters != null
            ? "on"
            : "off"}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Toggle
          id={stepFreeId}
          label={t("a11y.stepFree.label")}
          checked={prefs.stepFree}
          onChange={(v) => update({ stepFree: v })}
        />
        <Toggle
          id={shadeId}
          label={t("a11y.shade.label")}
          checked={prefs.preferShade}
          onChange={(v) => update({ preferShade: v })}
        />
      </div>

      {/* Walking cap — discrete steps + a calm "no cap" pill. */}
      <section className="mt-4 border-t border-line/70 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-sans text-[12px] font-semibold text-ink">
            {t("a11y.cap.label")}
          </span>
          <span className="font-mono text-[12px] font-semibold tabular-nums text-aegean-deep">
            {capLabel}
          </span>
        </div>
        <div className="mt-2 -mx-0.5 flex flex-wrap gap-1">
          <CapPill
            active={prefs.maxWalkMeters == null}
            label={t("a11y.cap.noneShort")}
            onClick={() => update({ maxWalkMeters: null })}
          />
          {WALK_CAP_STEPS.map((m) => (
            <CapPill
              key={m}
              active={prefs.maxWalkMeters === m}
              label={`${m}m`}
              onClick={() => update({ maxWalkMeters: m })}
            />
          ))}
        </div>
      </section>
    </article>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegean-deep/40 ${
        checked
          ? "bg-aegean-deep/10 ring-aegean-deep/40"
          : "bg-limestone-soft/60 ring-line/60 hover:bg-limestone-soft"
      }`}
    >
      <span className="min-w-0 truncate font-sans text-[13px] font-semibold text-ink">
        {label}
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-aegean-deep" : "bg-ink/20"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-limestone shadow-sm transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function CapPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-full px-2.5 font-mono text-[11px] font-semibold tabular-nums tracking-tight transition-colors ${
        active
          ? "bg-ink text-limestone"
          : "bg-limestone-soft text-ink ring-1 ring-line hover:bg-limestone-soft/70"
      }`}
    >
      {label}
    </button>
  );
}
