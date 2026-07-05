import { IconArrowUpRight, IconClock, IconPin } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
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
 * Surfaces a leave-by / arrive-by request from the NL planner so the rider
 * knows the search is honouring it, and can flip or clear it.
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
  const { t } = useI18n();
  if (!intent || (!intent.leaveByISO && !intent.arriveByISO)) return null;
  const iso = intent.arriveByISO ?? intent.leaveByISO!;
  const mode: "arrive" | "leave" = intent.arriveByISO ? "arrive" : "leave";
  const label = formatIntentLabel(iso, t);
  return (
    <div className="mt-3 flex items-center gap-2 rounded-full bg-aegean-soft/50 ring-1 ring-aegean-soft px-3 py-2">
      <IconClock className="size-3.5 text-aegean-deep shrink-0" />
      <button
        type="button"
        onClick={() =>
          onChange(
            mode === "arrive"
              ? { leaveByISO: iso, arriveByISO: null }
              : { leaveByISO: null, arriveByISO: iso },
          )
        }
        className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-aegean-deep hover:text-ink transition"
      >
        {mode === "arrive" ? t("trips.intentArriveBy") : t("trips.intentLeave")} {label}
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft hover:text-ink transition"
      >
        {t("trips.intentNow")}
      </button>
    </div>
  );
}
