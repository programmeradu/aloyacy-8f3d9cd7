// Bottom prompt that appears when the rider is within ~250 m of the
// destination but still has bus legs queued. Tapping accept collapses the
// remaining itinerary into a single final walk and logs the override so
// the planner learns from it.

import { useServerFn } from "@tanstack/react-start";
import { collapseToFinalWalk, type ActiveTrip } from "@/lib/trip-store";
import { logTripOverride } from "@/lib/overrides.functions";
import { getDeviceId } from "@/lib/pwa";

export function ShortcutPrompt({
  active,
  fix,
  distanceM,
  onDismiss,
}: {
  active: ActiveTrip;
  fix: { lat: number; lng: number };
  distanceM: number;
  onDismiss: () => void;
}) {
  const logOverride = useServerFn(logTripOverride);

  return (
    <section className="px-6 mt-4 animate-rise">
      <div className="rounded-[28px] bg-ochre-soft ring-1 ring-ochre/40 p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ochre">
          Skip ahead?
        </p>
        <p className="mt-2 font-display text-[22px] leading-tight text-ink">
          You're {Math.round(distanceM)} m from {active.to.label}.
        </p>
        <p className="mt-2 text-[13px] text-ink-soft">
          A short walk is faster than waiting for the next bus. Want to skip
          the rest and walk straight there?
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              collapseToFinalWalk(fix);
              void logOverride({
                data: {
                  deviceId: getDeviceId(),
                  from: { lat: active.from.lat, lng: active.from.lng },
                  to: { lat: active.to.lat, lng: active.to.lng },
                  plannedLegs: (active.itinerary?.legs ?? []) as unknown[],
                  kind: "skipped-transfer",
                },
              }).catch(() => {});
            }}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-[13px] text-limestone"
          >
            Walk the rest
          </button>
          <button
            onClick={onDismiss}
            className="inline-flex items-center gap-2 rounded-full ring-1 ring-line bg-card px-5 py-3 text-[13px] text-ink-soft"
          >
            Stay on plan
          </button>
        </div>
      </div>
    </section>
  );
}
