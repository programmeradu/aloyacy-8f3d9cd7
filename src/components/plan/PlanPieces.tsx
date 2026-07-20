import { cyInputToMs, cyInputValue, cyParts, cyWallToMs } from "@aloya/core/cy-time";
import { useEffect, useMemo, useState } from "react";
import { buildTimePresets, type TimePreset } from "@aloya/core/time-presets";
import { IconArrowUpRight, IconClock, IconPin } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { useTimeHistory } from "@/lib/time-history";
import { formatIntentLabel, suggestionLabel } from "@/lib/plan-bridge";
import type { Point, TimeIntent } from "@/lib/plan-types";
import type { TripSuggestion } from "@/lib/suggestions.functions";

export function EmptyState({
  origin,
  destination,
}: {
  origin: Point | null;
  destination: Point | null;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-[28px] bg-card p-6 ring-1 ring-line">
      <p className="font-display text-lg text-ink leading-tight text-balance">
        {origin && !destination ? t("trips.emptyTitleA") : t("trips.emptyTitleB")}
      </p>
      <p className="mt-2 text-[13px] text-ink-soft leading-relaxed">{t("trips.emptyBody")}</p>
    </div>
  );
}

export function PersonalSuggestions({
  items,
  onPick,
}: {
  items: TripSuggestion[];
  onPick: (s: TripSuggestion) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((s) => {
        const { text, sizeClass } = suggestionLabel(s.toLabel);
        return (
          <button
            key={s.key}
            onClick={() => onPick(s)}
            className="group flex items-center gap-4 rounded-[24px] bg-card ring-1 ring-line px-5 py-4 text-left transition-colors hover:bg-limestone-soft/60 active:scale-[0.995]"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-aegean/15 ring-1 ring-aegean/30 font-display text-[18px] text-aegean-deep tabular-nums">
              {s.count > 9 ? "9+" : s.count}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`font-display ${sizeClass} leading-[1.2] text-ink break-words [overflow-wrap:anywhere] line-clamp-2`}
                title={text}
              >
                {text}
              </p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft truncate">
                {s.blurb}
              </p>
            </div>
            <IconArrowUpRight className="size-4 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        );
      })}
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
        {t("trips.learnedFromPast")}
      </p>
    </div>
  );
}

export function PlanningSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 rounded-3xl bg-card ring-1 ring-line animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}

export function FieldRow({
  role,
  label,
  point,
  active,
  onActivate,
  onClear,
}: {
  role: "from" | "to";
  label: string;
  point: Point | null;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      onClick={onActivate}
      className={`group flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left transition-colors ${
        active ? "bg-limestone-soft" : "hover:bg-limestone-soft/60"
      }`}
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full ring-1 ${
          role === "from"
            ? "bg-aegean-soft/60 text-aegean-deep ring-aegean-soft"
            : "bg-ochre-soft text-ochre ring-ochre-soft"
        }`}
      >
        {role === "from" ? (
          <span className="block size-2 rounded-full bg-current" />
        ) : (
          <IconPin className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[11px] font-semibold tracking-tight text-ink-soft">{label}</p>
        <p className={`truncate text-[15px] ${point ? "text-ink font-medium" : "text-ink-soft"}`}>
          {point?.label ?? (role === "from" ? t("trips.detecting") : t("trips.searchPlaceholder"))}
        </p>
      </div>
      {point && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="rounded-full bg-limestone-soft px-3 py-1.5 font-sans text-[11px] font-semibold tracking-tight text-ink-soft hover:bg-ink hover:text-limestone transition-colors"
        >
          {t("trips.clear")}
        </span>
      )}
    </button>
  );
}

/**
 * The rider types Cyprus time — the buses run on Nicosia's clock no matter
 * where the phone thinks it is. Reading the browser zone here is what turned
 * "arrive by 08:30" into a promise watched for 11:30 on a device abroad.
 */
function toLocalInput(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? "" : cyInputValue(ms);
}

function fromLocalInput(value: string): string | null {
  const ms = cyInputToMs(value);
  return ms == null ? null : new Date(ms).toISOString();
}

/** Sensible first guess so the picker never opens on an empty field. */
function defaultISO(mode: "leave" | "arrive"): string {
  const raw = Date.now() + (mode === "arrive" ? 90 : 30) * 60_000;
  const p = cyParts(raw);
  // Round up to the next quarter hour — riders think in :00 / :15 / :30.
  const ms = cyWallToMs(p.year, p.month, p.day, p.hour, 0) + Math.ceil(p.minute / 15) * 15 * 60_000;
  return new Date(ms).toISOString();
}

/** "Today 17:00" / "Tomorrow 08:30" / "Thu 08:30", in the rider's language. */
function presetLabel(
  p: TimePreset,
  t: (k: "trips.presetToday" | "trips.presetTomorrow", v?: Record<string, string>) => string,
  locale: string,
): string {
  if (p.dayKey === "today") return t("trips.presetToday", { time: p.timeLabel });
  if (p.dayKey === "tomorrow") return t("trips.presetTomorrow", { time: p.timeLabel });
  const day = new Intl.DateTimeFormat(locale === "el" ? "el-CY" : "en-GB", {
    weekday: "short",
    timeZone: "Asia/Nicosia",
  }).format(new Date(p.iso));
  return `${day} ${p.timeLabel}`;
}

/**
 * The rider's departure/arrival intent: always visible, so "get me there by
 * 16:00" is a control on the page rather than a phrase only the NL planner
 * understands. Choosing "Arrive by" is also what unlocks the arrival promise.
 */
export function TimeIntentChip({
  intent,
  onChange,
  onClear,
}: {
  intent: TimeIntent | null;
  onChange: (i: TimeIntent) => void;
  onClear: () => void;
}) {
  const { t, locale } = useI18n();
  const history = useTimeHistory();
  const mode: "now" | "leave" | "arrive" = intent?.arriveByISO
    ? "arrive"
    : intent?.leaveByISO
      ? "leave"
      : "now";
  const iso = intent?.arriveByISO ?? intent?.leaveByISO ?? null;

  // The shortcuts are clock-relative, so they must not rot while the page is
  // open: re-derive them every minute (and whenever the rider's habits move).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const presets = useMemo(
    () =>
      mode === "now"
        ? []
        : buildTimePresets({ nowMs, mode: mode === "arrive" ? "arrive" : "leave", history }),
    [mode, nowMs, history],
  );

  const set = (next: "now" | "leave" | "arrive") => {
    if (next === "now") {
      onClear();
      return;
    }
    // Open on the rider's most likely time rather than an arbitrary offset.
    const suggested = buildTimePresets({ nowMs: Date.now(), mode: next, history, max: 1 })[0]?.iso;
    const keep = iso ?? suggested ?? defaultISO(next);
    onChange(
      next === "arrive"
        ? { leaveByISO: null, arriveByISO: keep }
        : { leaveByISO: keep, arriveByISO: null },
    );
  };

  const setISO = (nextISO: string | null) => {
    if (!nextISO) {
      onClear();
      return;
    }
    onChange(
      mode === "arrive"
        ? { leaveByISO: null, arriveByISO: nextISO }
        : { leaveByISO: nextISO, arriveByISO: null },
    );
  };

  const options: { key: "now" | "leave" | "arrive"; label: string }[] = [
    { key: "now", label: t("trips.intentNow") },
    { key: "leave", label: t("trips.intentLeave") },
    { key: "arrive", label: t("trips.intentArriveBy") },
  ];

  return (
    <div className="mt-3 rounded-[22px] bg-card ring-1 ring-line p-3">
      <div className="flex items-center gap-2">
        <IconClock className="size-3.5 shrink-0 text-aegean-deep" />
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => set(o.key)}
              aria-pressed={mode === o.key}
              className={`h-8 rounded-full px-3.5 font-sans text-[12.5px] font-semibold transition-colors ${
                mode === o.key
                  ? "bg-ink text-limestone"
                  : "bg-limestone-soft text-ink-soft ring-1 ring-line hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {mode !== "now" && (
        <div className="mt-3 border-t border-line pt-3">
          <input
            type="datetime-local"
            value={iso ? toLocalInput(iso) : ""}
            onChange={(e) => setISO(fromLocalInput(e.target.value))}
            aria-label={mode === "arrive" ? t("trips.intentArriveBy") : t("trips.intentLeave")}
            className="h-9 w-full rounded-full bg-limestone-soft px-4 font-sans text-[13px] font-semibold text-ink ring-1 ring-line outline-none focus:ring-aegean"
          />
          {presets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const active = iso
                  ? Math.abs(new Date(iso).getTime() - new Date(p.iso).getTime()) < 60_000
                  : false;
                return (
                  <button
                    key={p.iso}
                    type="button"
                    onClick={() => setISO(p.iso)}
                    aria-pressed={active}
                    className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 font-sans text-[12.5px] font-semibold ring-1 transition-colors ${
                      active
                        ? "bg-aegean/12 text-aegean-deep ring-aegean/40"
                        : "bg-limestone-soft text-ink-soft ring-line hover:text-ink"
                    }`}
                  >
                    <span className="whitespace-nowrap">{presetLabel(p, t, locale)}</span>
                    {p.source === "habit" && (
                      <span className="rounded-full bg-ochre/20 px-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink uppercase">
                        {t("trips.presetUsual")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {iso && (
        <p className="mt-2.5 font-sans text-[12.5px] leading-relaxed font-medium text-ink-soft">
          {mode === "arrive"
            ? t("trips.intentPlanArrive", { when: formatIntentLabel(iso, t) })
            : t("trips.intentPlanLeave", { when: formatIntentLabel(iso, t) })}
        </p>
      )}
    </div>
  );
}
