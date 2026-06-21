// Live, in-walk turn header. Sits above the WalkGuidance step list so that
// once the rider is actually walking, the screen is dominated by the
// imminent maneuver and a meters countdown — instead of forcing them to
// scan the list to figure out which step they're on.
//
// Used by MultiLegCompanion for every walk leg (initial, transfer, final).
// Renders nothing until GPS + directions are both ready, so the walk view
// degrades to the static step list without flicker.
//
// The single-leg JourneyHUD already has a dedicated LiveStepCard that does
// the same thing with phase-specific copy; this is the equivalent for
// multi-leg journeys where the phase machine is busier.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWalkingDirections } from "@/lib/maps.functions";
import { projectOnSteps, WALK_M_PER_S, type WalkStep } from "@/lib/geo";
import { useI18n, type DictKey } from "@/lib/i18n";
import type { LiveFix } from "@/lib/useGeoWatch";

type LatLng = { lat: number; lng: number };

const ARRIVAL_RADIUS_M = 25;

function fmtMeters(m: number): string {
  if (m < 10) return "< 10 m";
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtEta(sec: number): string {
  if (sec < 60) return `< 1 min`;
  return `${Math.round(sec / 60)} min`;
}

export function LiveWalkBanner({
  from,
  to,
  fix,
  title,
}: {
  from: LatLng;
  to: LatLng;
  fix: LiveFix | null;
  title: string;
}) {
  const { locale, t } = useI18n();
  const fetchDirections = useServerFn(getWalkingDirections);
  // Share the cache with WalkGuidance so we don't double-fetch the same
  // origin/destination — same queryKey shape.
  const { data } = useQuery({
    queryKey: ["walk", from.lat, from.lng, to.lat, to.lng, locale],
    queryFn: () => fetchDirections({ data: { from, to, locale } }),
    staleTime: 10 * 60 * 1000,
  });
  const steps: WalkStep[] = data?.directions?.steps ?? [];

  const projection = useMemo(() => {
    if (!fix || steps.length === 0) return null;
    return projectOnSteps({ lat: fix.lat, lng: fix.lng }, steps, to);
  }, [fix, steps, to]);

  // Quiet failure modes — let WalkGuidance carry the screen.
  if (!projection || steps.length === 0) return null;

  const step = steps[projection.currentIndex];
  const next = steps[projection.currentIndex + 1];
  const isFinal = projection.currentIndex >= steps.length - 1;
  const atTurn = projection.metersToStepEnd < ARRIVAL_RADIUS_M;
  const normalized = (step.maneuver || "straight").toLowerCase().replace(/[-_]/g, " ");
  const maneuverKey = `walk.maneuver.${normalized}` as DictKey;
  const maneuverLabel = t(maneuverKey) === maneuverKey ? normalized : t(maneuverKey);
  // ETA = remaining distance ÷ walking pace, floor at 60s.
  const etaSec = Math.max(
    60,
    Math.round(projection.metersToDestination / WALK_M_PER_S),
  );

  return (
    <section className="mt-5 px-6 animate-rise">
      <article className="relative overflow-hidden rounded-[28px] bg-ink text-limestone ring-1 ring-ink/60">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--color-aegean) 22%, transparent) 0%, transparent 55%), radial-gradient(80% 60% at 0% 120%, color-mix(in oklab, var(--color-olive) 14%, transparent) 0%, transparent 60%)",
          }}
        />
        <div className="relative px-5 py-5">
          {/* Eyebrow row: title + total time/distance left */}
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-limestone/70">
              {title}
            </p>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-limestone/60 tabular-nums">
              {fmtMeters(projection.metersToDestination)} — {fmtEta(etaSec)}
            </p>
          </div>

          {/* Maneuver chip + distance-to-turn — the rider's primary anchor. */}
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-full bg-limestone/[0.10] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-limestone/85 ring-1 ring-limestone/15">
              {maneuverLabel}
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] tabular-nums text-aegean-soft">
              {atTurn
                ? t("walkLive.now")
                : t("walkLive.inMeters", { m: fmtMeters(projection.metersToStepEnd) })}
            </span>
          </div>

          {/* Current instruction in big editorial type. */}
          <p className="mt-2 font-display text-[28px] font-semibold leading-[1.1] tracking-tight text-limestone text-balance">
            {step.instruction}
          </p>

          {/* "Then" preview — quiet, only when there's a next step. */}
          {next && !isFinal && (
            <div className="mt-4 border-t border-limestone/15 pt-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-limestone/55">
                {t("walkLive.then")}
              </p>
              <p className="mt-1 font-display text-[15px] font-medium leading-snug text-limestone/85">
                {next.instruction}
              </p>
            </div>
          )}
          {isFinal && (
            <div className="mt-4 border-t border-limestone/15 pt-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-olive-soft">
                {t("walkLive.lastStep")}
              </p>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
