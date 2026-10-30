import { cyInputToMs, cyInputValue, cyParts, cyWallToMs } from "@aloya/core/cy-time";
import { useEffect, useMemo, useState } from "react";
import { buildTimePresets, type TimePreset } from "@aloya/core/time-presets";
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
    <div className="r-card r-card--pad">
      <p className="r-t3 text-balance">
        {origin && !destination ? t("trips.emptyTitleA") : t("trips.emptyTitleB")}
      </p>
      <p className="r-lbl mt-1.5 leading-relaxed">{t("trips.emptyBody")}</p>
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
    <div>
      <div className="r-card overflow-hidden">
        {items.map((s) => {
          const { text } = suggestionLabel(s.toLabel);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onPick(s)}
              className="r-row w-full text-left"
            >
              <span className="r-icobox r-tnum text-[15px] font-semibold">
                {s.count > 9 ? "9+" : s.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium" title={text}>
                  {text}
                </span>
                <span className="r-lbl block truncate">{s.blurb}</span>
              </span>
              <i
                className="ph ph-arrow-up-right"
                style={{ fontSize: 17, color: "var(--r-mute)" }}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <p className="r-lbl mt-2 px-1">{t("trips.learnedFromPast")}</p>
    </div>
  );
}

export function PlanningSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`h-36 rounded-[26px] animate-pulse ${i === 0 ? "bg-[var(--r-char)]" : "bg-white"}`}
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
    <div
      className={`flex w-full items-center gap-3 rounded-[20px] px-3 transition-colors ${active ? "bg-[#f3f3f0]" : ""}`}
    >
      <span className="flex w-4 justify-center" aria-hidden="true">
        {role === "from" ? (
          <span className="r-dot" style={{ width: 10, height: 10 }} />
        ) : (
          <span
            className="r-ring"
            style={{ width: 11, height: 11, boxShadow: "inset 0 0 0 3px var(--r-ink)" }}
          />
        )}
      </span>
      <button type="button" onClick={onActivate} className="min-w-0 flex-1 py-3 text-left">
        <span className="block r-lbl">{label}</span>
        <span
          className={`mt-0.5 block truncate text-[16px] ${point ? "font-medium text-[var(--r-ink)]" : "text-[var(--r-mute)]"}`}
        >
          {point?.label ?? (role === "from" ? t("trips.detecting") : t("trips.searchPlaceholder"))}
        </span>
      </button>
      {point && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`${t("trips.clear")} ${label}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--r-mute)]"
        >
          <i className="ph ph-x" style={{ fontSize: 16 }} aria-hidden="true" />
        </button>
      )}
    </div>
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
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2" role="group">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => set(o.key)}
            aria-pressed={mode === o.key}
            className={`r-pill r-pill--lg ${mode === o.key ? "r-pill--k" : "r-pill--w"}`}
          >
            {o.key === "now" && <i className="ph ph-clock" aria-hidden="true" />}
            {o.label}
          </button>
        ))}
      </div>

      {mode !== "now" && (
        <div className="r-hscroll mt-2">
          {/* The native picker sits transparent over its own chip so the row
              stays one consistent scale instead of a full-width input block. */}
          <label
            className="r-pill r-pill--lg r-pill--w relative"
            style={{ boxShadow: "inset 0 0 0 1.5px var(--r-ink)" }}
          >
            <i className="ph ph-calendar-blank" aria-hidden="true" />
            <span className="whitespace-nowrap">
              {iso ? formatIntentLabel(iso, t) : t("trips.intentSetTime")}
            </span>
            <input
              type="datetime-local"
              value={iso ? toLocalInput(iso) : ""}
              onChange={(e) => setISO(fromLocalInput(e.target.value))}
              aria-label={mode === "arrive" ? t("trips.intentArriveBy") : t("trips.intentLeave")}
              className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0 outline-none"
            />
          </label>

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
                className={`r-pill r-pill--lg ${active ? "r-pill--y" : "r-pill--w"}`}
              >
                <span className="whitespace-nowrap">{presetLabel(p, t, locale)}</span>
                {p.source === "habit" && (
                  <span className="r-lbl" style={{ fontSize: 12 }}>
                    {t("trips.presetUsual")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
