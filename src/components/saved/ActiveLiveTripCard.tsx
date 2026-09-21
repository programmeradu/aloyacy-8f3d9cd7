import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RouteChip } from "@/components/RouteChip";
import { IconArrowUpRight } from "@/components/Icons";
import { clearActiveTrip, getActiveTrip, type ActiveTrip } from "@/lib/trip-store";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export function ActiveLiveTripCard() {
  const [activeTrip, setActiveTripState] = useState<ActiveTrip | null>(() => getActiveTrip());
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();

  useEffect(() => {
    function onStoreChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.key || detail.key === "aloya:active-trip") {
        setActiveTripState(getActiveTrip());
      }
    }
    window.addEventListener("aloya:store", onStoreChange);
    return () => window.removeEventListener("aloya:store", onStoreChange);
  }, []);

  if (!activeTrip) return null;

  const busLeg = activeTrip.option.legs.find((l) => l.kind === "bus");
  const routeCode = busLeg?.routeShort ?? "Live";

  return (
    <section className="px-6 mb-3 animate-rise">
      <div className="flex flex-col gap-3 rounded-3xl bg-aegean-deep text-limestone p-5 shadow-lg ring-1 ring-aegean-deep/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-ochre animate-pulse" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] opacity-80">
              {isOnline ? "Trip In Progress" : "Active • GPS Ready"}
            </span>
          </div>
          <button
            onClick={() => {
              clearActiveTrip();
              setActiveTripState(null);
            }}
            className="rounded-full bg-limestone/15 px-2.5 py-0.5 font-sans text-[11px] font-medium text-limestone hover:bg-limestone/25"
          >
            End Trip
          </button>
        </div>

        <div className="flex items-center gap-3">
          <RouteChip code={routeCode} tone="ochre" />
          <div className="min-w-0">
            <p className="font-display text-lg font-medium leading-tight truncate">
              {activeTrip.to.label}
            </p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider opacity-75 truncate">
              from {activeTrip.from.label}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate({ to: `/trip/${activeTrip.option.id}` })}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-limestone py-2.5 font-sans text-[13px] font-semibold text-ink shadow-sm hover:bg-limestone-soft"
        >
          <span>Resume Live Guidance</span>
          <IconArrowUpRight className="size-3.5" />
        </button>
      </div>
    </section>
  );
}
