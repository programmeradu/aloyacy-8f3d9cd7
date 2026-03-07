// Wave 2.2 — Accessibility Preferences card.
//
// Lives in /wallet. Editorial treatment matches ProAccountCard: ink-on-
// limestone, big numerals for the walking cap slider, no generic icons.
// Toggles are large enough for 44px tap targets without artifice.

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
    <article className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-line">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
            {t("a11y.eyebrow")}
          </p>
          <h2 className="mt-1 font-display text-[20px] font-semibold leading-tight text-ink">
            {t("a11y.title")}
          </h2>
        </div>
      </header>

      <p className="mt-2 font-sans text-[13px] leading-snug text-ink-soft">
        {t("a11y.lede")}
      </p>

      <div className="mt-5 space-y-3">
        <Toggle
          id={stepFreeId}
          label={t("a11y.stepFree.label")}
          help={t("a11y.stepFree.help")}
          checked={prefs.stepFree}
          onChange={(v) => update({ stepFree: v })}
        />
        <Toggle
          id={shadeId}
          label={t("a11y.shade.label")}
          help={t("a11y.shade.help")}
          checked={prefs.preferShade}
          onChange={(v) => update({ preferShade: v })}
        />
      </div>

      {/* Walking cap — exposed as discrete steps + a calm "no cap" button.
          We avoid a free-form slider so screen-reader and motor users don't
          have to fight with imprecise input. */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-sans text-[13px] font-semibold text-ink">
            {t("a11y.cap.label")}
          </span>
          <span className="font-mono text-[12px] font-semibold tabular-nums text-aegean-deep">
            {capLabel}
          </span>
        </div>
        <p className="mt-1 font-sans text-[12px] leading-snug text-ink-soft">
          {t("a11y.cap.help")}
        </p>
        <div className="mt-3 -mx-1 flex flex-wrap gap-1.5">
          <CapPill
            active={prefs.maxWalkMeters == null}
            label={t("a11y.cap.noneShort")}
            onClick={() => update({ maxWalkMeters: null })}
          />
          {WALK_CAP_STEPS.map((m) => (
            <CapPill
              key={m}
              active={prefs.maxWalkMeters === m}
              label={`${m} m`}
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
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-limestone-soft/60 p-3.5 ring-1 ring-line/60">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block font-sans text-[14px] font-semibold text-ink">
          {label}
        </span>
        <span className="mt-0.5 block font-sans text-[12px] leading-snug text-ink-soft">
          {help}
        </span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-aegean-deep" : "bg-ink/15"
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aegean-deep/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 transform rounded-full bg-limestone shadow-sm transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
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
      className={`min-h-11 rounded-full px-3.5 font-mono text-[12px] font-semibold tabular-nums tracking-tight transition-colors ${
        active
          ? "bg-ink text-limestone"
          : "bg-limestone-soft text-ink ring-1 ring-line hover:bg-limestone-soft/70"
      }`}
    >
      {label}
    </button>
  );
}
